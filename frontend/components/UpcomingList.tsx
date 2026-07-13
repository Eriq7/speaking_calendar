"use client";

import { UpcomingGroup } from "@/lib/types";
import { UpcomingReminder } from "@/lib/types";
import { isoToLocalDateString, formatFriendlyDate, formatTime } from "@/lib/date";

interface UpcomingListProps {
  upcoming: UpcomingGroup[];
  onSelect: (reminder: UpcomingReminder) => void;
  onComplete: (ids: string[]) => void;
}

function CheckIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export default function UpcomingList({ upcoming, onSelect, onComplete }: UpcomingListProps) {
  if (upcoming.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-gray-400">
        No upcoming reminders yet.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {upcoming.map((g) => {
        const r = g.representative;
        return (
          <li key={g.key}>
            {/* Outer div so two child buttons are valid HTML (no button-in-button). */}
            <div className="flex w-full items-center rounded-lg border border-border bg-surface transition-colors hover:bg-gray-50">
              {/* Main area — opens detail modal */}
              <button
                type="button"
                onClick={() => onSelect(r)}
                className="flex flex-1 items-center gap-3 px-4 py-3 text-left"
              >
                <span
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: r.color }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-gray-900">
                    {r.title}
                  </span>
                  <span className="block text-xs text-gray-500">
                    {formatFriendlyDate(isoToLocalDateString(r.fire_at))}
                    {" · "}
                    {formatTime(r.time)}
                    {g.hasEarly ? " · early reminder" : ""}
                  </span>
                </span>
                {r.location && (
                  <span className="hidden shrink-0 text-xs text-gray-400 sm:block">
                    {r.location}
                  </span>
                )}
              </button>

              {/* Complete button — marks every reminder in the group */}
              <button
                type="button"
                onClick={() => onComplete(g.ids)}
                aria-label={`Mark "${r.title}" as complete`}
                title="Mark as complete"
                className="shrink-0 px-3 py-3 text-gray-300 transition-colors hover:text-green-600"
              >
                <CheckIcon />
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
