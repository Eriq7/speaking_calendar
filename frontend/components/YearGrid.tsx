"use client";

import { useMemo } from "react";
import { DBReminder } from "@/lib/types";
import {
  toLocalDateString,
  todayLocalString,
  isoToLocalDateString,
} from "@/lib/date";

interface YearGridProps {
  reminders: DBReminder[];
  onCellClick: (date: string) => void;
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

  // Grid begins on the Sunday on/before Jan 1.
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

export default function YearGrid({ reminders, onCellClick }: YearGridProps) {
  const year = new Date().getFullYear();
  const today = todayLocalString();

  const weeks = useMemo(() => buildWeeks(year), [year]);

  // Map date → uncompleted day-of reminder colors (for coloring future cells).
  // Map date → whether any uncompleted day-of reminder exists (for overdue detection).
  const { colorsByDate, hasUncompletedByDate } = useMemo(() => {
    const colors = new Map<string, string[]>();
    const hasUncompleted = new Map<string, boolean>();

    for (const r of reminders) {
      // reminders prop already contains only day-of (filtered in GET /api/events)
      const date = isoToLocalDateString(r.fire_at);
      if (!r.completed) {
        const list = colors.get(date) ?? [];
        if (!list.includes(r.color)) list.push(r.color);
        colors.set(date, list);
        hasUncompleted.set(date, true);
      }
    }
    return { colorsByDate: colors, hasUncompletedByDate: hasUncompleted };
  }, [reminders]);

  // Month labels: show when the month of the first in-year day of a week column changes.
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
    <div className="overflow-x-auto">
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
          {weeks.map((week) => (
            <div key={week[0].date} className="flex flex-col gap-1">
              {week.map((cell) => (
                <YearCell
                  key={cell.date}
                  cell={cell}
                  today={today}
                  colors={colorsByDate.get(cell.date) ?? []}
                  hasUncompletedReminder={hasUncompletedByDate.get(cell.date) ?? false}
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
  colors: string[];           // uncompleted day-of reminder colors for this date
  hasUncompletedReminder: boolean;
  onClick: () => void;
}

function YearCell({ cell, today, colors, hasUncompletedReminder, onClick }: YearCellProps) {
  if (!cell.inYear) {
    return <div className="h-3 w-3" aria-hidden />;
  }

  const isPast = cell.date < today; // INV-12: pure frontend comparison
  const isToday = cell.date === today;

  const base = "h-3 w-3 rounded-sm transition-transform hover:scale-125 focus:outline-none";
  // Today gets an accent blue ring regardless of other state.
  const todayRing = isToday ? " ring-1 ring-accent" : "";

  if (isPast) {
    // Past dates are always gray — reminder colors are suppressed (Q7).
    // If there are uncompleted reminders on a past date → overdue: add red ring (Q8).
    const overdueRing = hasUncompletedReminder ? " ring-2 ring-red-500" : "";
    return (
      <button
        type="button"
        title={cell.date}
        onClick={onClick}
        className={`${base} bg-past-cell${overdueRing}${todayRing}`}
      />
    );
  }

  // Future (including today): show colors if uncompleted reminders exist.
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
      </button>
    );
  }

  // Future, no reminder: white with light border.
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
