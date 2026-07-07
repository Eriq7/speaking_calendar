"use client";

import { EventInput } from "@/lib/types";
import {
  RepeatKind,
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
  "w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none";
const labelClass = "mb-1 block text-xs font-medium text-gray-500";

export default function EventPreviewCard({
  event,
  onUpdate,
  onDelete,
}: EventPreviewCardProps) {
  const set = <K extends keyof EventInput>(key: K, val: EventInput[K]) =>
    onUpdate({ ...event, [key]: val });

  const repeat = rruleToRepeat(event.rrule);

  const onRepeatKind = (kind: RepeatKind) => {
    // Keep the original schedule (BYDAY/INTERVAL/etc.) untouched.
    if (kind === "advanced") return;
    const next = repeatToRrule({ kind, intervalDays: repeat.intervalDays });
    onUpdate({
      ...event,
      rrule: next,
      repeat_end_date: kind === "none" ? null : event.repeat_end_date,
    });
  };

  const onCustomInterval = (days: number) =>
    set("rrule", repeatToRrule({ kind: "custom", intervalDays: days }));

  return (
    <div
      className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
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
        <div>
          <label className={labelClass}>Remind me early (days)</label>
          <input
            type="number"
            min={0}
            value={event.early_reminder ?? ""}
            onChange={(e) =>
              set(
                "early_reminder",
                e.target.value === "" ? null : Math.max(0, Number(e.target.value))
              )
            }
            placeholder="None"
            className={inputClass}
          />
        </div>
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
            <option value="custom">Custom (every N days)</option>
            {repeat.kind === "advanced" && (
              <option value="advanced">Custom schedule (keeps original)</option>
            )}
          </select>
        </div>
      </div>

      {repeat.kind === "custom" && (
        <div className="mt-3">
          <label className={labelClass}>Every N days</label>
          <input
            type="number"
            min={1}
            value={repeat.intervalDays}
            onChange={(e) => onCustomInterval(Math.max(1, Number(e.target.value)))}
            className={inputClass}
          />
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
