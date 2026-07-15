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

export interface RepeatValue {
  kind: RepeatKind;
  intervalN: number;        // meaningful when kind === "custom"
  intervalUnit: RepeatFreq; // meaningful when kind === "custom"
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
  const hasExtraParams = Object.keys(parts).some(
    (k) => k !== "FREQ" && k !== "INTERVAL"
  );

  if (!hasExtraParams && freq) {
    if (freq === "DAILY" && interval === 1) return { kind: "daily", intervalN: 1, intervalUnit: "DAILY" };
    if (freq === "WEEKLY" && interval === 1) return { kind: "weekly", intervalN: 1, intervalUnit: "WEEKLY" };
    if (freq === "MONTHLY" && interval === 1) return { kind: "monthly", intervalN: 1, intervalUnit: "MONTHLY" };
    // Any freq with interval > 1, or MINUTELY/HOURLY → "custom"
    return { kind: "custom", intervalN: interval, intervalUnit: freq };
  }

  return { kind: "advanced", intervalN: interval > 1 ? interval : 1, intervalUnit: freq ?? "DAILY", raw: rrule };
}

export function repeatToRrule(value: RepeatValue): string | null {
  switch (value.kind) {
    case "none":
      return null;
    case "daily":
      return "FREQ=DAILY";
    case "weekly":
      return "FREQ=WEEKLY";
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
    case "weekly":  return "Weekly";
    case "monthly": return "Monthly";
    case "custom": {
      const [singular, plural] = UNIT_LABEL[v.intervalUnit];
      return `Every ${v.intervalN} ${v.intervalN === 1 ? singular : plural}`;
    }
    case "advanced": return "Custom schedule";
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
    case "weekly":  label = "weekly"; break;
    case "monthly": label = "monthly"; break;
    case "custom": {
      const [singular, plural] = UNIT_LABEL[v.intervalUnit];
      label = v.intervalN === 1
        ? `every ${singular}`
        : `every ${v.intervalN} ${plural}`;
      break;
    }
    case "advanced": label = "on a custom schedule"; break;
  }
  if (!repeat_end_date) return `Repeats ${label}`;
  return `Repeats ${label} until ${formatFriendlyDate(repeat_end_date)}`;
}
