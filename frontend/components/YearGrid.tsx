"use client";

import { useEffect, useMemo, useRef } from "react";
import { DBEvent, DBReminder } from "@/lib/types";
import {
  toLocalDateString,
  todayLocalString,
  isoToLocalDateString,
} from "@/lib/date";

interface YearGridProps {
  reminders: DBReminder[];
  events: DBEvent[];
  onCellClick: (date: string) => void;
  /** Current timestamp in ms — used to detect same-day passed reminders. */
  nowMs: number;
}

interface Cell {
  date: string; // YYYY-MM-DD
  inYear: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function buildWeeks(year: number): Cell[][] {
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year, 11, 31);

  const gridStart = new Date(yearStart);
  gridStart.setDate(gridStart.getDate() - gridStart.getDay());

  const weeks: Cell[][] = [];
  let cursor = new Date(gridStart);
  while (cursor <= yearEnd || cursor.getDay() !== 0) {
    const week: Cell[] = [];
    for (let d = 0; d < 7; d++) {
      const inYear = cursor.getFullYear() === year;
      week.push({ date: toLocalDateString(cursor), inYear });
      cursor = new Date(cursor.getTime() + DAY_MS);
    }
    weeks.push(week);
    if (cursor > yearEnd && cursor.getDay() === 0) break;
  }
  return weeks;
}

export default function YearGrid({ reminders, events, onCellClick, nowMs }: YearGridProps) {
  const year = new Date().getFullYear();
  const today = todayLocalString();

  const weeks = useMemo(() => buildWeeks(year), [year]);

  // Find which week index contains today (for scroll targeting).
  const todayWeekIndex = useMemo(
    () => weeks.findIndex((w) => w.some((c) => c.date === today)),
    [weeks, today]
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const todayColRef = useRef<HTMLDivElement>(null);

  // P1: scroll the grid so today is visible near the left edge on mount.
  useEffect(() => {
    if (containerRef.current && todayColRef.current) {
      const container = containerRef.current;
      const col = todayColRef.current;
      container.scrollLeft = Math.max(0, col.offsetLeft - 32);
    }
  }, []);

  // Build the set of event IDs that have rrule (repeating).
  const rruleEventIds = useMemo(
    () => new Set(events.filter((e) => e.rrule).map((e) => e.id)),
    [events]
  );

  // P3: compute solid vs dot rendering per date.
  // P4: track overdue — any day-of reminder whose fire time has passed and is uncompleted,
  //     including same-day reminders (fire_at <= nowMs covers today as well as past days).
  const { solidColorsByDate, dotColorsByDate, hasOverdueByDate } = useMemo(() => {
    // For repeating events: find the earliest uncompleted future date → solid; later ones → dot.
    const nextDateByEvent = new Map<string, string>();
    for (const r of reminders) {
      if (!r.completed && rruleEventIds.has(r.event_id)) {
        const date = isoToLocalDateString(r.fire_at);
        if (date >= today) {
          const current = nextDateByEvent.get(r.event_id);
          if (!current || date < current) nextDateByEvent.set(r.event_id, date);
        }
      }
    }

    const solid = new Map<string, string[]>();
    const dot = new Map<string, string[]>();
    const hasOverdue = new Map<string, boolean>();

    for (const r of reminders) {
      if (!r.completed) {
        const date = isoToLocalDateString(r.fire_at);

        // Mark the date as having an overdue reminder if the fire moment has passed.
        if (new Date(r.fire_at).getTime() <= nowMs) {
          hasOverdue.set(date, true);
        }

        const isRepeat = rruleEventIds.has(r.event_id);
        const isNext = !isRepeat || nextDateByEvent.get(r.event_id) === date;

        if (isNext) {
          const list = solid.get(date) ?? [];
          if (!list.includes(r.color)) list.push(r.color);
          solid.set(date, list);
        } else {
          const list = dot.get(date) ?? [];
          if (!list.includes(r.color)) list.push(r.color);
          dot.set(date, list);
        }
      }
    }

    return { solidColorsByDate: solid, dotColorsByDate: dot, hasOverdueByDate: hasOverdue };
  }, [reminders, rruleEventIds, today, nowMs]);

  const monthLabels = useMemo(() => {
    const labels: (string | null)[] = [];
    let lastMonth = -1;
    for (const week of weeks) {
      const firstInYear = week.find((c) => c.inYear);
      if (firstInYear) {
        const month = Number(firstInYear.date.split("-")[1]) - 1;
        if (month !== lastMonth) {
          labels.push(MONTH_LABELS[month]);
          lastMonth = month;
        } else {
          labels.push(null);
        }
      } else {
        labels.push(null);
      }
    }
    return labels;
  }, [weeks]);

  return (
    <div ref={containerRef} className="overflow-x-auto">
      <div className="inline-flex flex-col gap-1">
        <div className="flex gap-1 pl-1">
          {monthLabels.map((label, i) => (
            <div
              key={weeks[i][0].date}
              className="w-3 text-[9px] leading-none text-gray-400"
            >
              {label ?? ""}
            </div>
          ))}
        </div>
        <div className="flex gap-1">
          {weeks.map((week, wi) => (
            <div
              key={week[0].date}
              ref={wi === todayWeekIndex ? todayColRef : undefined}
              className="flex flex-col gap-1"
            >
              {week.map((cell) => (
                <YearCell
                  key={cell.date}
                  cell={cell}
                  today={today}
                  colors={solidColorsByDate.get(cell.date) ?? []}
                  dotColors={dotColorsByDate.get(cell.date) ?? []}
                  hasUncompletedReminder={hasOverdueByDate.get(cell.date) ?? false}
                  onClick={() => onCellClick(cell.date)}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

interface YearCellProps {
  cell: Cell;
  today: string;
  colors: string[];
  dotColors: string[];
  hasUncompletedReminder: boolean;
  onClick: () => void;
}

function YearCell({ cell, today, colors, dotColors, hasUncompletedReminder, onClick }: YearCellProps) {
  if (!cell.inYear) {
    return <div className="h-3 w-3" aria-hidden />;
  }

  const isPast = cell.date < today;
  const isToday = cell.date === today;

  const base = "h-3 w-3 rounded-sm transition-transform hover:scale-125 focus:outline-none";
  const todayRing = isToday ? " ring-1 ring-accent" : "";

  // P4: show red ✕ for any cell (past OR today) that has an uncompleted passed reminder.
  if (hasUncompletedReminder && (isPast || isToday)) {
    // Past cells use the flat past-cell background; today keeps its color if it has one.
    const bgClass = isPast ? " bg-past-cell" : colors.length > 0 ? "" : " bg-surface border border-border";
    const bgStyle = !isPast && colors.length === 1 ? { backgroundColor: colors[0] } : undefined;
    return (
      <button
        type="button"
        title={cell.date}
        onClick={onClick}
        className={`${base}${bgClass}${todayRing} relative overflow-hidden`}
        style={bgStyle}
      >
        {!isPast && colors.length > 1 && <Quadrants colors={colors} />}
        <span className="absolute inset-0 flex items-center justify-center text-red-500" style={{ fontSize: "7px", fontWeight: 700, lineHeight: 1 }}>
          ✕
        </span>
      </button>
    );
  }

  // Plain past cell (no overdue reminder).
  if (isPast) {
    return (
      <button
        type="button"
        title={cell.date}
        onClick={onClick}
        className={`${base} bg-past-cell${todayRing}`}
      />
    );
  }

  // Future (including today): solid colors for non-repeat / next occurrence.
  if (colors.length > 0) {
    return (
      <button
        type="button"
        title={cell.date}
        onClick={onClick}
        className={`${base}${todayRing} relative overflow-hidden`}
        style={colors.length === 1 ? { backgroundColor: colors[0] } : undefined}
      >
        {colors.length > 1 && <Quadrants colors={colors} />}
        {/* If there are also dot-only reminders on the same date, they're visually subsumed by the solid block */}
      </button>
    );
  }

  // P3: dot-only cells for non-next occurrences of repeating events.
  if (dotColors.length > 0) {
    return (
      <button
        type="button"
        title={cell.date}
        onClick={onClick}
        className={`${base}${todayRing} relative border border-border bg-surface overflow-hidden`}
      >
        <span className="absolute inset-0 flex items-center justify-center">
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: dotColors[0], opacity: 0.35 }}
          />
        </span>
      </button>
    );
  }

  // Future, no reminder.
  return (
    <button
      type="button"
      title={cell.date}
      onClick={onClick}
      className={`${base} border border-border bg-surface${todayRing}`}
    />
  );
}

// Up to 4 quadrant color blocks; "+N" overlay for overflow.
function Quadrants({ colors }: { colors: string[] }) {
  const shown = colors.slice(0, 4);
  const overflow = colors.length - 4;
  const positions = ["top-0 left-0", "top-0 right-0", "bottom-0 left-0", "bottom-0 right-0"];
  return (
    <>
      {shown.map((c, i) => (
        <span
          key={c}
          className={`absolute h-1.5 w-1.5 ${positions[i]}`}
          style={{ backgroundColor: c }}
        />
      ))}
      {overflow > 0 && (
        <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-[6px] font-bold leading-none text-white">
          +{overflow}
        </span>
      )}
    </>
  );
}
