"use client";

import { UpcomingReminder } from "@/lib/types";
import { isoToLocalDateString, formatFriendlyDate, formatTime } from "@/lib/date";

interface UpcomingListProps {
  upcoming: UpcomingReminder[];
  onSelect: (reminder: UpcomingReminder) => void;
}

export default function UpcomingList({ upcoming, onSelect }: UpcomingListProps) {
  if (upcoming.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-gray-400">
        No upcoming reminders yet.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {upcoming.map((r) => (
        <li key={r.id}>
          <button
            type="button"
            onClick={() => onSelect(r)}
            className="flex w-full items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 text-left transition-colors hover:bg-gray-50"
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
                {r.kind === "early" ? " · early reminder" : ""}
              </span>
            </span>
            {r.location && (
              <span className="hidden shrink-0 text-xs text-gray-400 sm:block">
                {r.location}
              </span>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}
