// Maps between the repeat dropdown UI and iCalendar RRULE strings.

export type RepeatKind =
  | "none"
  | "daily"
  | "weekly"
  | "monthly"
  | "custom"
  | "advanced";

export interface RepeatValue {
  kind: RepeatKind;
  intervalDays: number; // only meaningful when kind === "custom"
  raw?: string; // original rrule, preserved verbatim when kind === "advanced"
}

export function rruleToRepeat(rrule: string | null): RepeatValue {
  if (!rrule) return { kind: "none", intervalDays: 2 };
  const parts = Object.fromEntries(
    rrule
      .split(";")
      .map((p) => p.split("="))
      .filter((kv) => kv.length === 2)
      .map(([k, v]) => [k.toUpperCase(), v.toUpperCase()])
  );
  const freq = parts.FREQ;
  const interval = parts.INTERVAL ? parseInt(parts.INTERVAL, 10) : 1;
  // Any parameter beyond FREQ/INTERVAL (BYDAY, BYMONTHDAY, UNTIL, COUNT, …)
  // cannot be round-tripped through the simple dropdown; preserve it verbatim.
  const hasExtraParams = Object.keys(parts).some(
    (k) => k !== "FREQ" && k !== "INTERVAL"
  );

  if (freq === "DAILY" && !hasExtraParams) {
    return interval > 1
      ? { kind: "custom", intervalDays: interval }
      : { kind: "daily", intervalDays: 2 };
  }
  if (freq === "WEEKLY" && interval === 1 && !hasExtraParams) {
    return { kind: "weekly", intervalDays: 2 };
  }
  if (freq === "MONTHLY" && interval === 1 && !hasExtraParams) {
    return { kind: "monthly", intervalDays: 2 };
  }
  return { kind: "advanced", intervalDays: interval > 1 ? interval : 2, raw: rrule };
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
      const n = Math.max(1, Math.floor(value.intervalDays || 1));
      return `FREQ=DAILY;INTERVAL=${n}`;
    }
    case "advanced":
      return value.raw ?? null;
  }
}

export function repeatLabel(rrule: string | null): string {
  const v = rruleToRepeat(rrule);
  switch (v.kind) {
    case "none":
      return "Does not repeat";
    case "daily":
      return "Daily";
    case "weekly":
      return "Weekly";
    case "monthly":
      return "Monthly";
    case "custom":
      return `Every ${v.intervalDays} days`;
    case "advanced":
      return "Custom schedule";
  }
}
