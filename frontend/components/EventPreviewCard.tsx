"use client";

import { EventInput, EarlyUnit } from "@/lib/types";
import {
  RepeatKind,
  RepeatFreq,
  WeekdayCode,
  WEEKDAY_CODES,
  WEEKDAY_SHORT,
  rruleToRepeat,
  repeatToRrule,
  orderByday,
  humanizeRrule,
} from "@/lib/repeat";
import ColorPicker from "./ColorPicker";

interface EventPreviewCardProps {
  event: EventInput;
  onUpdate: (event: EventInput) => void;
  onDelete: () => void;
}

const inputClass =
  "w-full rounded-md border border-border px-3 py-2 text-sm text-gray-900 focus:border-accent focus:outline-none";
const labelClass = "mb-1 block text-xs font-medium text-gray-500";

const EARLY_UNITS: { value: EarlyUnit; label: string }[] = [
  { value: "minute", label: "minutes" },
  { value: "hour",   label: "hours" },
  { value: "day",    label: "days" },
  { value: "week",   label: "weeks" },
  { value: "month",  label: "months" },
];

const REPEAT_FREQ_OPTIONS: { value: RepeatFreq; label: string }[] = [
  { value: "MINUTELY", label: "minutes" },
  { value: "HOURLY",   label: "hours" },
  { value: "DAILY",    label: "days" },
  { value: "WEEKLY",   label: "weeks" },
  { value: "MONTHLY",  label: "months" },
];

// Derive the weekday RRULE code (MO–SU) for a YYYY-MM-DD date string.
// Uses UTC midnight to match the convention in expand.ts.
function weekdayCodeForDate(dateStr: string): WeekdayCode {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun … 6=Sat
  // Map JS getUTCDay() to Mon-first WEEKDAY_CODES index: Sun→6, Mon→0 … Sat→5
  const idx = dow === 0 ? 6 : dow - 1;
  return WEEKDAY_CODES[idx];
}

export default function EventPreviewCard({
  event,
  onUpdate,
  onDelete,
}: EventPreviewCardProps) {
  const set = <K extends keyof EventInput>(key: K, val: EventInput[K]) =>
    onUpdate({ ...event, [key]: val });

  const repeat = rruleToRepeat(event.rrule);

  const onRepeatKind = (kind: RepeatKind) => {
    if (kind === "advanced") return;
    const next = repeatToRrule({ kind, intervalN: repeat.intervalN, intervalUnit: repeat.intervalUnit });
    onUpdate({
      ...event,
      rrule: next,
      repeat_end_date: kind === "none" ? null : event.repeat_end_date,
    });
  };

  const onCustomRepeat = (n: number, unit: RepeatFreq) =>
    set("rrule", repeatToRrule({ kind: "custom", intervalN: n, intervalUnit: unit }));

  // The effective weekdays shown as selected in the chip row.
  // When byday is empty (plain FREQ=WEEKLY), highlight the event's start-day weekday.
  const effectiveDays: WeekdayCode[] =
    repeat.kind === "weekly"
      ? (repeat.byday && repeat.byday.length > 0
          ? repeat.byday
          : [weekdayCodeForDate(event.date)])
      : [];

  const onToggleWeekday = (code: WeekdayCode) => {
    const current = effectiveDays;
    const next = current.includes(code)
      ? current.filter((c) => c !== code)
      : [...current, code];
    if (next.length === 0) return; // enforce ≥1 day
    set("rrule", repeatToRrule({ kind: "weekly", intervalN: 1, intervalUnit: "WEEKLY", byday: orderByday(next) }));
  };

  return (
    <div
      className="rounded-xl border border-border bg-surface p-4 shadow-sm"
      style={{ borderLeft: `4px solid ${event.color}` }}
    >
      <div className="mb-3 flex items-center gap-3">
        <input
          value={event.title}
          onChange={(e) => set("title", e.target.value)}
          placeholder="Title"
          className="flex-1 border-0 border-b border-transparent text-lg font-semibold text-gray-900 focus:border-gray-300 focus:outline-none"
        />
        <ColorPicker value={event.color} onChange={(c) => set("color", c)} />
        <button
          type="button"
          onClick={onDelete}
          aria-label="Remove event"
          className="rounded-md px-2 py-1 text-sm text-gray-400 hover:bg-gray-100 hover:text-red-500"
        >
          Remove
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Date</label>
          <input
            type="date"
            value={event.date}
            onChange={(e) => set("date", e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Time</label>
          <input
            type="time"
            value={event.time ?? ""}
            onChange={(e) => set("time", e.target.value || null)}
            className={inputClass}
          />
        </div>
      </div>

      <div className="mt-3">
        <label className={labelClass}>Location</label>
        <input
          value={event.location ?? ""}
          onChange={(e) => set("location", e.target.value || null)}
          placeholder="Add location"
          className={inputClass}
        />
      </div>

      <div className="mt-3">
        <label className={labelClass}>Note</label>
        <textarea
          value={event.note ?? ""}
          onChange={(e) => set("note", e.target.value || null)}
          placeholder="Add note"
          rows={2}
          className={inputClass}
        />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        {/* Early reminder: value + unit */}
        <div>
          <label className={labelClass}>Remind early</label>
          <div className="flex gap-2">
            <input
              type="number"
              min={0}
              value={event.early_value ?? ""}
              onChange={(e) => {
                const val = e.target.value === "" ? null : Math.max(0, Number(e.target.value));
                onUpdate({
                  ...event,
                  early_value: val,
                  early_unit: val == null ? null : (event.early_unit ?? "hour"),
                });
              }}
              placeholder="None"
              className="w-20 rounded-md border border-border px-3 py-2 text-sm text-gray-900 focus:border-accent focus:outline-none"
            />
            <select
              value={event.early_unit ?? "hour"}
              onChange={(e) => set("early_unit", (e.target.value as EarlyUnit) || null)}
              disabled={event.early_value == null}
              className="flex-1 rounded-md border border-border px-2 py-2 text-sm text-gray-900 focus:border-accent focus:outline-none disabled:opacity-40"
            >
              {EARLY_UNITS.map((u) => (
                <option key={u.value} value={u.value}>{u.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Repeat */}
        <div>
          <label className={labelClass}>Repeat</label>
          <select
            value={repeat.kind}
            onChange={(e) => onRepeatKind(e.target.value as RepeatKind)}
            className={inputClass}
          >
            <option value="none">Does not repeat</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="custom">Every N [unit]</option>
            {repeat.kind === "advanced" && (
              <option value="advanced">
                {event.rrule ? humanizeRrule(event.rrule) : "Advanced"}
              </option>
            )}
          </select>
        </div>
      </div>

      {/* Weekday chip selector — shown for weekly repeats */}
      {repeat.kind === "weekly" && (
        <div className="mt-3">
          <label className={labelClass}>Repeat on</label>
          <div className="flex flex-wrap gap-1.5">
            {WEEKDAY_CODES.map((code) => {
              const selected = effectiveDays.includes(code);
              return (
                <button
                  key={code}
                  type="button"
                  onClick={() => onToggleWeekday(code)}
                  className={
                    "rounded-full px-2.5 py-1 text-xs font-medium border transition-colors " +
                    (selected
                      ? "bg-accent text-white border-accent"
                      : "border-border text-gray-600 hover:border-gray-400")
                  }
                >
                  {WEEKDAY_SHORT[code]}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Every N [unit] controls */}
      {repeat.kind === "custom" && (
        <div className="mt-3 flex gap-2">
          <div className="flex-1">
            <label className={labelClass}>Every N</label>
            <input
              type="number"
              min={1}
              value={repeat.intervalN}
              onChange={(e) => onCustomRepeat(Math.max(1, Number(e.target.value)), repeat.intervalUnit)}
              className={inputClass}
            />
          </div>
          <div className="flex-1">
            <label className={labelClass}>Unit</label>
            <select
              value={repeat.intervalUnit}
              onChange={(e) => onCustomRepeat(repeat.intervalN, e.target.value as RepeatFreq)}
              className={inputClass}
            >
              {REPEAT_FREQ_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {repeat.kind !== "none" && (
        <div className="mt-3">
          <label className={labelClass}>Repeat until (optional)</label>
          <input
            type="date"
            value={event.repeat_end_date ?? ""}
            onChange={(e) => set("repeat_end_date", e.target.value || null)}
            className={inputClass}
          />
        </div>
      )}
    </div>
  );
}
