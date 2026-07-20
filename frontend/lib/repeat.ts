// Maps between the repeat dropdown UI and iCalendar RRULE strings.

import { formatFriendlyDate } from "./date";

export type RepeatKind =
  | "none"
  | "daily"
  | "weekly"
  | "monthly"
  | "custom"    // every N [unit]
  | "advanced"; // arbitrary rrule, preserved verbatim

export type RepeatFreq = "MINUTELY" | "HOURLY" | "DAILY" | "WEEKLY" | "MONTHLY";

// Mon→Sun order: RRULE codes & short display labels
export const WEEKDAY_CODES = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;
export type WeekdayCode = (typeof WEEKDAY_CODES)[number];

export const WEEKDAY_SHORT: Record<WeekdayCode, string> = {
  MO: "Mon", TU: "Tue", WE: "Wed", TH: "Thu", FR: "Fri", SA: "Sat", SU: "Sun",
};

// Sort BYDAY codes into Mon→Sun canonical order.
export function orderByday(codes: string[]): WeekdayCode[] {
  const upper = codes.map((x) => x.toUpperCase());
  return WEEKDAY_CODES.filter((c) => upper.includes(c));
}

// ["MO","TU","WE"] → "Mon, Tue, Wed"
export function weekdaysText(codes: string[]): string {
  return orderByday(codes).map((c) => WEEKDAY_SHORT[c]).join(", ");
}

// Dependency-free plain-English summary of an arbitrary rrule (for the rare exotic case).
export function humanizeRrule(rrule: string): string {
  const parts = Object.fromEntries(
    rrule.split(";")
      .map((p) => p.split("="))
      .filter((kv) => kv.length === 2)
      .map(([k, v]) => [k.toUpperCase(), v.toUpperCase()])
  );
  const freq = parts.FREQ ?? "";
  const interval = parts.INTERVAL ? parseInt(parts.INTERVAL, 10) : 1;
  const byday = parts.BYDAY ? parts.BYDAY.split(",") : [];
  const bymonthday = parts.BYMONTHDAY;

  const freqLabel: Record<string, [string, string]> = {
    MINUTELY: ["minute", "minutes"],
    HOURLY:   ["hour",   "hours"],
    DAILY:    ["day",    "days"],
    WEEKLY:   ["week",   "weeks"],
    MONTHLY:  ["month",  "months"],
    YEARLY:   ["year",   "years"],
  };
  const [sg, pl] = freqLabel[freq] ?? ["occurrence", "occurrences"];
  let base = interval === 1 ? `Every ${sg}` : `Every ${interval} ${pl}`;
  if (byday.length) base += ` on ${weekdaysText(byday)}`;
  if (bymonthday) base += ` on day ${bymonthday}`;
  return base;
}

export interface RepeatValue {
  kind: RepeatKind;
  intervalN: number;        // meaningful when kind === "custom"
  intervalUnit: RepeatFreq; // meaningful when kind === "custom"
  byday?: WeekdayCode[];    // meaningful when kind === "weekly" (empty = no specific days)
  raw?: string;             // original rrule, preserved verbatim when kind === "advanced"
}

export function rruleToRepeat(rrule: string | null): RepeatValue {
  if (!rrule) return { kind: "none", intervalN: 1, intervalUnit: "DAILY" };

  const parts = Object.fromEntries(
    rrule
      .split(";")
      .map((p) => p.split("="))
      .filter((kv) => kv.length === 2)
      .map(([k, v]) => [k.toUpperCase(), v.toUpperCase()])
  );
  const freq = parts.FREQ as RepeatFreq | undefined;
  const interval = parts.INTERVAL ? parseInt(parts.INTERVAL, 10) : 1;
  const extraKeys = Object.keys(parts).filter((k) => k !== "FREQ" && k !== "INTERVAL");

  // Simple cases: no extra params
  if (extraKeys.length === 0 && freq) {
    if (freq === "DAILY"   && interval === 1) return { kind: "daily",   intervalN: 1, intervalUnit: "DAILY" };
    if (freq === "WEEKLY"  && interval === 1) return { kind: "weekly",  intervalN: 1, intervalUnit: "WEEKLY", byday: [] };
    if (freq === "MONTHLY" && interval === 1) return { kind: "monthly", intervalN: 1, intervalUnit: "MONTHLY" };
    // Any freq with interval > 1, or MINUTELY/HOURLY → "custom"
    return { kind: "custom", intervalN: interval, intervalUnit: freq };
  }

  // Weekly + only BYDAY → first-class "weekly with specific days"
  if (freq === "WEEKLY" && interval === 1 && extraKeys.length === 1 && extraKeys[0] === "BYDAY") {
    const byday = orderByday(parts.BYDAY.split(","));
    return { kind: "weekly", intervalN: 1, intervalUnit: "WEEKLY", byday };
  }

  // Anything else is truly exotic → advanced with humanized display
  return { kind: "advanced", intervalN: interval > 1 ? interval : 1, intervalUnit: freq ?? "DAILY", raw: rrule };
}

export function repeatToRrule(value: RepeatValue): string | null {
  switch (value.kind) {
    case "none":
      return null;
    case "daily":
      return "FREQ=DAILY";
    case "weekly": {
      const days = orderByday(value.byday ?? []);
      return days.length ? `FREQ=WEEKLY;BYDAY=${days.join(",")}` : "FREQ=WEEKLY";
    }
    case "monthly":
      return "FREQ=MONTHLY";
    case "custom": {
      const n = Math.max(1, Math.floor(value.intervalN || 1));
      return `FREQ=${value.intervalUnit};INTERVAL=${n}`;
    }
    case "advanced":
      return value.raw ?? null;
  }
}

const UNIT_LABEL: Record<RepeatFreq, [string, string]> = {
  MINUTELY: ["minute", "minutes"],
  HOURLY:   ["hour",   "hours"],
  DAILY:    ["day",    "days"],
  WEEKLY:   ["week",   "weeks"],
  MONTHLY:  ["month",  "months"],
};

export function repeatLabel(rrule: string | null): string {
  const v = rruleToRepeat(rrule);
  switch (v.kind) {
    case "none":    return "Does not repeat";
    case "daily":   return "Daily";
    case "weekly":
      return v.byday && v.byday.length
        ? `Weekly on ${weekdaysText(v.byday)}`
        : "Weekly";
    case "monthly": return "Monthly";
    case "custom": {
      const [singular, plural] = UNIT_LABEL[v.intervalUnit];
      return `Every ${v.intervalN} ${v.intervalN === 1 ? singular : plural}`;
    }
    case "advanced": return v.raw ? humanizeRrule(v.raw) : "Repeating";
  }
}

/** Human-readable repeat summary for the Coming up card meta line.
 *  Returns null for non-repeating events. */
export function repeatSummary(rrule: string | null, repeat_end_date: string | null): string | null {
  if (!rrule) return null;
  const v = rruleToRepeat(rrule);
  let label: string;
  switch (v.kind) {
    case "none": return null;
    case "daily":   label = "daily"; break;
    case "weekly":
      label = v.byday && v.byday.length
        ? `weekly on ${weekdaysText(v.byday)}`
        : "weekly";
      break;
    case "monthly": label = "monthly"; break;
    case "custom": {
      const [singular, plural] = UNIT_LABEL[v.intervalUnit];
      label = v.intervalN === 1
        ? `every ${singular}`
        : `every ${v.intervalN} ${plural}`;
      break;
    }
    case "advanced":
      label = v.raw ? humanizeRrule(v.raw).toLowerCase() : "on a custom schedule";
      break;
  }
  if (!repeat_end_date) return `Repeats ${label}`;
  return `Repeats ${label} until ${formatFriendlyDate(repeat_end_date)}`;
}
