"use client";

import { DBEvent, DetailEvent } from "@/lib/types";
import { formatFriendlyDate, formatTime } from "@/lib/date";
import { repeatLabel } from "@/lib/repeat";

interface DetailModalProps {
  title: string;
  events: DetailEvent[];
  onClose: () => void;
  onEdit: (event: DBEvent) => void;
  onDelete: (id: string) => void;
  onComplete: (reminderId: string, completed: boolean) => void;
}

export default function DetailModal({
  title,
  events,
  onClose,
  onEdit,
  onDelete,
  onComplete,
}: DetailModalProps) {
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl bg-surface p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md px-2 py-1 text-gray-400 hover:bg-gray-100"
          >
            ✕
          </button>
        </div>

        {events.length === 0 ? (
          <p className="text-sm text-gray-400">Nothing scheduled.</p>
        ) : (
          <div className="flex flex-col gap-4">
            {events.map((ev) => (
              <div
                key={ev.id}
                className={`rounded-xl border border-border p-4 ${ev.reminderCompleted ? "opacity-60" : ""}`}
                style={{ borderLeft: `4px solid ${ev.color}` }}
              >
                {/* Overdue banner */}
                {ev.isOverdue && (
                  <div className="mb-2 flex items-center gap-1.5 text-sm font-medium text-red-600">
                    <span aria-hidden>!</span>
                    <span>Overdue</span>
                  </div>
                )}

                <div className="mb-2 flex items-start justify-between gap-2">
                  <h3
                    className={`font-medium text-gray-900 ${ev.reminderCompleted ? "line-through text-gray-400" : ""}`}
                  >
                    {ev.title}
                  </h3>
                  <span
                    className="mt-1 h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: ev.color }}
                  />
                </div>

                <dl className="space-y-1 text-sm text-gray-600">
                  <Row label="When">
                    {formatFriendlyDate(ev.date)} · {formatTime(ev.time)}
                  </Row>
                  {ev.location && <Row label="Where">{ev.location}</Row>}
                  {ev.note && <Row label="Note">{ev.note}</Row>}
                  <Row label="Repeat">{repeatLabel(ev.rrule)}</Row>
                  {ev.early_reminder != null && (
                    <Row label="Early reminder">
                      {ev.early_reminder} day(s) before
                    </Row>
                  )}
                </dl>

                <div className="mt-3 flex flex-wrap gap-2">
                  {/* Complete / Undo */}
                  {ev.reminderId && (
                    ev.reminderCompleted ? (
                      <button
                        type="button"
                        onClick={() => onComplete(ev.reminderId!, false)}
                        className="rounded-md border border-gray-300 px-3 py-1 text-sm text-gray-600 hover:bg-gray-50"
                      >
                        Undo
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onComplete(ev.reminderId!, true)}
                        className="rounded-md border border-green-300 px-3 py-1 text-sm text-green-700 hover:bg-green-50"
                      >
                        ✓ Mark as complete
                      </button>
                    )
                  )}

                  <button
                    type="button"
                    onClick={() => onEdit(ev)}
                    className="rounded-md border border-border px-3 py-1 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(ev.id)}
                    className="rounded-md border border-red-200 px-3 py-1 text-sm text-red-600 hover:bg-red-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="w-24 shrink-0 text-gray-400">{label}</dt>
      <dd className="flex-1 text-gray-800">{children}</dd>
    </div>
  );
}
