import { rrulestr } from "rrule";
import type { EventInput, DBReminder, EarlyUnit } from "./types";

// "completed" is omitted because the DB column defaults to false on insert.
export type NewReminder = Omit<DBReminder, "id" | "event_id" | "sent" | "completed">;

// INV-11: reject timezones that are not valid IANA identifiers.
export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// Cap rows per event to prevent DB explosion from high-frequency rules.
const MAX_ROWS_PER_EVENT = 500;
// Horizon for minutely/hourly rules: 30 days from now (weekly backfill rolls forward).
const HIGH_FREQ_HORIZON_MS = 30 * 24 * 3600 * 1000;

// Offset (tz - UTC) in ms for the given instant and IANA timezone.
function tzOffsetMs(instant: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(instant);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUTC = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") === 24 ? 0 : get("hour"),
    get("minute"),
    get("second")
  );
  return asUTC - instant.getTime();
}

// Convert a local wall-clock time in `timeZone` to a UTC Date (INV-1).
function wallTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string
): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const offset = tzOffsetMs(new Date(guess), timeZone);
  return new Date(guess - offset);
}

function parseTime(time: string | null): { hour: number; minute: number } {
  if (!time) return { hour: 9, minute: 0 };
  const [h, m] = time.split(":").map(Number);
  return { hour: h, minute: m };
}

// End of next year, as a UTC-midnight marker date (INV-8).
function openEndedLimit(): Date {
  const nextYear = new Date().getUTCFullYear() + 1;
  return new Date(Date.UTC(nextYear, 11, 31, 23, 59, 59));
}

// Extract FREQ value from an rrule string.
function rruleFreq(rrule: string): string {
  const match = rrule.toUpperCase().match(/FREQ=([A-Z]+)/);
  return match ? match[1] : "";
}

// Local calendar dates on which the event occurs.
function occurrenceDates(event: EventInput): Date[] {
  const [y, mo, d] = event.date.split("-").map(Number);
  // Represent the local calendar date as UTC midnight so rrule acts as a
  // pure date generator, independent of DST.
  const dtstart = new Date(Date.UTC(y, mo - 1, d, 0, 0, 0));

  const excluded = new Set<string>(event.excluded_dates ?? []);
  const isExcluded = (date: Date) => {
    const s = [
      date.getUTCFullYear(),
      String(date.getUTCMonth() + 1).padStart(2, "0"),
      String(date.getUTCDate()).padStart(2, "0"),
    ].join("-");
    return excluded.has(s);
  };

  if (!event.rrule) {
    return isExcluded(dtstart) ? [] : [dtstart];
  }

  const baseUntil = event.repeat_end_date
    ? (() => {
        const [ey, em, ed] = event.repeat_end_date!.split("-").map(Number);
        return new Date(Date.UTC(ey, em - 1, ed, 23, 59, 59));
      })()
    : openEndedLimit();

  // Cap horizon for high-frequency rules to prevent DB explosion.
  const freq = rruleFreq(event.rrule);
  let until = baseUntil;
  if (freq === "MINUTELY" || freq === "HOURLY") {
    const shortHorizon = new Date(Date.now() + HIGH_FREQ_HORIZON_MS);
    if (shortHorizon < until) until = shortHorizon;
  }

  const rule = rrulestr(event.rrule, { dtstart });
  const all = rule.between(dtstart, until, true);
  return all.filter((d) => !isExcluded(d)).slice(0, MAX_ROWS_PER_EVENT);
}

// Compute UTC fire_at for an early reminder: event time minus the given offset.
function earlyFireAt(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  earlyValue: number,
  earlyUnit: EarlyUnit,
  timezone: string
): Date {
  const eventTime = wallTimeToUtc(year, month, day, hour, minute, timezone);

  switch (earlyUnit) {
    case "minute":
      return new Date(eventTime.getTime() - earlyValue * 60 * 1000);
    case "hour":
      return new Date(eventTime.getTime() - earlyValue * 3600 * 1000);
    case "day": {
      const shifted = new Date(Date.UTC(year, month - 1, day - earlyValue));
      return wallTimeToUtc(
        shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate(),
        hour, minute, timezone
      );
    }
    case "week": {
      const shifted = new Date(Date.UTC(year, month - 1, day - earlyValue * 7));
      return wallTimeToUtc(
        shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate(),
        hour, minute, timezone
      );
    }
    case "month": {
      let m = month - earlyValue;
      let y = year;
      while (m < 1) { m += 12; y--; }
      // Clamp day to last day of target month.
      const maxDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
      return wallTimeToUtc(y, m, Math.min(day, maxDay), hour, minute, timezone);
    }
  }
}

// Expand an event into its reminders with UTC fire_at timestamps.
export function expandReminders(
  event: EventInput,
  timezone: string
): NewReminder[] {
  const { hour, minute } = parseTime(event.time);
  const reminders: NewReminder[] = [];

  for (const occ of occurrenceDates(event)) {
    const year = occ.getUTCFullYear();
    const month = occ.getUTCMonth() + 1;
    const day = occ.getUTCDate();

    // INV-2: exactly one day-of reminder per occurrence.
    const dayOf = wallTimeToUtc(year, month, day, hour, minute, timezone);
    reminders.push({
      fire_at: dayOf.toISOString(),
      kind: "day-of",
      days_before: null,
      early_value: null,
      early_unit: null,
      title: event.title,
      time: event.time,
      location: event.location,
      color: event.color,
    });

    // Early reminder: fire_at = event time − offset (any unit).
    if (event.early_value != null && event.early_value > 0 && event.early_unit) {
      const early = earlyFireAt(
        year, month, day, hour, minute,
        event.early_value, event.early_unit,
        timezone
      );
      reminders.push({
        fire_at: early.toISOString(),
        kind: "early",
        // Populate legacy days_before for unit=day so old push code still works.
        days_before: event.early_unit === "day" ? event.early_value : null,
        early_value: event.early_value,
        early_unit: event.early_unit,
        title: event.title,
        time: event.time,
        location: event.location,
        color: event.color,
      });
    }
  }

  return reminders;
}
