import { rrulestr } from "rrule";
import type { EventInput, DBReminder } from "./types";

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

// Time-of-day (local) used when an event has no explicit time.
const DEFAULT_HOUR = 9;
const DEFAULT_MINUTE = 0;

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
  if (!time) return { hour: DEFAULT_HOUR, minute: DEFAULT_MINUTE };
  const [h, m] = time.split(":").map(Number);
  return { hour: h, minute: m };
}

// End of next year, as a UTC-midnight marker date (INV-8).
function openEndedLimit(): Date {
  const nextYear = new Date().getUTCFullYear() + 1;
  return new Date(Date.UTC(nextYear, 11, 31, 23, 59, 59));
}

// Local calendar dates on which the event occurs.
function occurrenceDates(event: EventInput): Date[] {
  const [y, mo, d] = event.date.split("-").map(Number);
  // Represent the local calendar date as UTC midnight so rrule acts as a
  // pure date generator, independent of DST.
  const dtstart = new Date(Date.UTC(y, mo - 1, d, 0, 0, 0));

  if (!event.rrule) return [dtstart];

  const until = event.repeat_end_date
    ? (() => {
        const [ey, em, ed] = event.repeat_end_date!.split("-").map(Number);
        return new Date(Date.UTC(ey, em - 1, ed, 23, 59, 59));
      })()
    : openEndedLimit();

  const rule = rrulestr(event.rrule, { dtstart });
  return rule.between(dtstart, until, true);
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
      title: event.title,
      time: event.time,
      location: event.location,
      color: event.color,
    });

    // INV-3: early reminder N days before, at the default local hour.
    if (event.early_reminder && event.early_reminder > 0) {
      const early = wallTimeToUtc(
        year,
        month,
        day - event.early_reminder,
        DEFAULT_HOUR,
        DEFAULT_MINUTE,
        timezone
      );
      reminders.push({
        fire_at: early.toISOString(),
        kind: "early",
        days_before: event.early_reminder,
        title: event.title,
        time: event.time,
        location: event.location,
        color: event.color,
      });
    }
  }

  return reminders;
}
