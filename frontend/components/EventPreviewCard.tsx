"use client";

import { EventInput, EarlyUnit } from "@/lib/types";
import {
  RepeatKind,
  RepeatFreq,
  rruleToRepeat,
  repeatToRrule,
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
              <option value="advanced">Custom schedule (keeps original)</option>
            )}
          </select>
        </div>
      </div>

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
