"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DBEvent,
  DBReminder,
  DetailEvent,
  EventInput,
  EventsResponse,
  ParseResponse,
  Settings,
  UpcomingReminder,
} from "@/lib/types";
import { groupUpcoming } from "@/lib/upcoming";
import {
  getLocalTimezone,
  todayLocalString,
  nowLocalString,
  isoToLocalDateString,
  formatFriendlyDate,
  formatTime,
} from "@/lib/date";
import { registerServiceWorker, enableNotifications, isIOS, isIOSChrome, isStandalone, setBadge } from "@/lib/push";
import YearGrid from "@/components/YearGrid";
import UpcomingList from "@/components/UpcomingList";
import EventPreviewCard from "@/components/EventPreviewCard";
import DetailModal from "@/components/DetailModal";
import SettingsPanel from "@/components/SettingsPanel";

function dbEventToInput(ev: DBEvent): EventInput {
  return {
    title: ev.title,
    note: ev.note,
    date: ev.date,
    time: ev.time,
    location: ev.location,
    early_value: ev.early_value,
    early_unit: ev.early_unit,
    rrule: ev.rrule,
    repeat_end_date: ev.repeat_end_date,
    color: ev.color,
  };
}

interface DetailState {
  title: string;
  events: DetailEvent[];
}

interface Draft {
  uid: string;
  event: EventInput;
}

interface Toast {
  reminderIds: string[];
}

function toDraft(event: EventInput): Draft {
  return { uid: crypto.randomUUID(), event };
}

export default function Home() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [data, setData] = useState<EventsResponse | null>(null);

  const [text, setText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [detail, setDetail] = useState<DetailState | null>(null);

  const [notifPermission, setNotifPermission] = useState<NotificationPermission | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // INV-12: "not complete" is computed on the frontend from live time (never the backend).
  // Tick every minute so an open tab updates without a manual reload.
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const bump = () => setNow(Date.now());
    const id = setInterval(bump, 60_000);
    // Also refresh immediately when the user returns to the tab (e.g. after dismissing a push).
    window.addEventListener("visibilitychange", bump);
    window.addEventListener("focus", bump);
    return () => {
      clearInterval(id);
      window.removeEventListener("visibilitychange", bump);
      window.removeEventListener("focus", bump);
    };
  }, []);

  const loadEvents = useCallback(async () => {
    const res = await fetch("/api/events");
    if (res.ok) setData(await res.json());
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    registerServiceWorker().catch(() => {});
    if ("Notification" in window) {
      setNotifPermission(Notification.permission);
      if (Notification.permission === "granted") {
        enableNotifications().catch(() => {});
      }
    }
  }, []);

  useEffect(() => {
    loadEvents();
    fetch("/api/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((s: Settings | null) => s && setSettings(s))
      .catch(() => {});

    fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timezone: getLocalTimezone() }),
    }).catch(() => {});
  }, [loadEvents]);

  const mergeSettings = (patch: Partial<Settings>) =>
    setSettings((prev) => ({
      user_name: prev?.user_name ?? "",
      butler_name: prev?.butler_name ?? "",
      timezone: prev?.timezone ?? getLocalTimezone(),
      ...patch,
    }));

  const handleEnableNotifications = async () => {
    const perm = await enableNotifications();
    if (perm) setNotifPermission(perm);
  };

  const showNotifBanner =
    !bannerDismissed &&
    (notifPermission === "default" || (isIOS() && !isStandalone() && notifPermission !== null));

  // ── Parse + confirm ─────────────────────────────────────────────────────────
  const parse = async () => {
    if (!text.trim()) return;
    setParsing(true);
    setError(null);
    try {
      const res = await fetch("/api/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          timezone: getLocalTimezone(),
          today: todayLocalString(),
          now: nowLocalString(),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Sorry, I couldn't understand that.");
      }
      const body: ParseResponse = await res.json();
      setEditingId(null);
      setDrafts(body.events.map(toDraft));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setParsing(false);
    }
  };

  const confirm = async () => {
    if (!drafts || drafts.length === 0) return;
    setConfirming(true);
    setError(null);
    const timezone = getLocalTimezone();
    try {
      if (editingId) {
        await fetch(`/api/events/${editingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...drafts[0].event, timezone }),
        });
      } else {
        await fetch("/api/events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ events: drafts.map((d) => d.event), timezone }),
        });
      }
      setDrafts(null);
      setEditingId(null);
      setText("");
      await loadEvents();
    } catch {
      setError("Failed to save. Please try again.");
    } finally {
      setConfirming(false);
    }
  };

  const updateDraft = (uid: string, next: EventInput) =>
    setDrafts((d) => d && d.map((dr) => (dr.uid === uid ? { ...dr, event: next } : dr)));

  const deleteDraft = (uid: string) =>
    setDrafts((d) => {
      if (!d) return d;
      const rest = d.filter((dr) => dr.uid !== uid);
      return rest.length ? rest : null;
    });

  // ── Mark as complete ────────────────────────────────────────────────────────
  const patchComplete = useCallback(async (reminderId: string, completed: boolean) => {
    await fetch(`/api/reminders/${reminderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed }),
    });
    setDetail((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        events: prev.events.map((ev) =>
          ev.reminderId === reminderId
            ? { ...ev, reminderCompleted: completed, isOverdue: ev.isOverdue && !completed }
            : ev
        ),
      };
    });
    await loadEvents();
  }, [loadEvents]);

  const completeReminder = useCallback(async (reminderId: string) => {
    await patchComplete(reminderId, true);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ reminderIds: [reminderId] });
    toastTimerRef.current = setTimeout(() => setToast(null), 5000);
  }, [patchComplete]);

  const undoComplete = useCallback(async () => {
    if (!toast) return;
    const ids = toast.reminderIds;
    setToast(null);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    await Promise.all(ids.map((id) => patchComplete(id, false)));
  }, [toast, patchComplete]);

  const handleComplete = useCallback((reminderId: string, completed: boolean) => {
    if (completed) {
      completeReminder(reminderId);
    } else {
      patchComplete(reminderId, false);
    }
  }, [completeReminder, patchComplete]);

  const handleCompleteGroup = useCallback(async (ids: string[]) => {
    await Promise.all(ids.map((id) => patchComplete(id, true)));
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ reminderIds: ids });
    toastTimerRef.current = setTimeout(() => setToast(null), 5000);
  }, [patchComplete]);

  // ── Detail modal helpers ─────────────────────────────────────────────────────
  const openDetailByDate = (date: string) => {
    if (!data) return;
    const nowIso = new Date().toISOString();
    const remindersByEventId = new Map<string, DBReminder>();
    for (const r of data.reminders) {
      if (isoToLocalDateString(r.fire_at) === date) {
        remindersByEventId.set(r.event_id, r);
      }
    }
    const detailEvents: DetailEvent[] = data.events
      .filter((e) => remindersByEventId.has(e.id))
      .map((e) => {
        const r = remindersByEventId.get(e.id)!;
        return {
          ...e,
          reminderId: r.id,
          reminderCompleted: r.completed,
          isOverdue: r.fire_at <= nowIso && !r.completed,
          occurrenceDate: date,
        };
      });
    if (detailEvents.length === 0) return;
    setDetail({ title: formatFriendlyDate(date), events: detailEvents });
  };

  const openDetailByReminder = (r: UpcomingReminder) => {
    if (!data) return;
    const nowIso = new Date().toISOString();
    // Determine the actual occurrence date (day-of fire date, not early reminder date).
    let occDate: string;
    if (r.kind === "day-of") {
      occDate = isoToLocalDateString(r.fire_at);
    } else {
      const dayOf = data.upcoming.find(
        (up) => up.event_id === r.event_id && up.kind === "day-of" && up.fire_at > r.fire_at
      );
      occDate = dayOf ? isoToLocalDateString(dayOf.fire_at) : isoToLocalDateString(r.fire_at);
    }
    const events: DetailEvent[] = data.events
      .filter((e) => e.id === r.event_id)
      .map((e) => ({
        ...e,
        reminderId: r.id,
        reminderCompleted: r.completed,
        isOverdue: r.fire_at <= nowIso && !r.completed,
        occurrenceDate: occDate,
      }));
    if (events.length === 0) return;
    setDetail({ title: r.title, events });
  };

  // Opens a detail modal scoped to a single reminder (used by the "Not complete" list).
  const openDetailForReminder = (r: DBReminder) => {
    const e = data?.events.find((ev) => ev.id === r.event_id);
    if (!e) return;
    const nowIso = new Date().toISOString();
    const occDate = isoToLocalDateString(r.fire_at);
    setDetail({
      title: e.title,
      events: [
        {
          ...e,
          reminderId: r.id,
          reminderCompleted: r.completed,
          isOverdue: r.fire_at <= nowIso && !r.completed,
          occurrenceDate: occDate,
        },
      ],
    });
  };

  const startEdit = (ev: DBEvent) => {
    setDetail(null);
    setEditingId(ev.id);
    setDrafts([toDraft(dbEventToInput(ev))]);
  };

  const deleteEvent = async (id: string) => {
    await fetch(`/api/events/${id}`, { method: "DELETE" });
    setDetail(null);
    await loadEvents();
  };

  // P5: delete a single occurrence of a repeating event.
  const deleteOccurrence = async (eventId: string, date: string) => {
    setDetail(null);
    await fetch(`/api/events/${eventId}/occurrence`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, timezone: getLocalTimezone() }),
    });
    await loadEvents();
  };

  const butler = settings?.butler_name?.trim() || "your butler";
  const userSuffix = settings?.user_name?.trim()
    ? `, ${settings.user_name.trim()}`
    : "";

  // Build events map for groupUpcoming.
  const eventsMap = useMemo(
    () => new Map((data?.events ?? []).map((e) => [e.id, e])),
    [data]
  );

  const groupedUpcoming = useMemo(
    () => groupUpcoming(data?.upcoming ?? [], eventsMap),
    [data, eventsMap]
  );

  // P4: compute "not complete" items — one entry per missed day-of reminder
  // (fire_at <= now, not completed), sorted most-recently-missed first.
  // Each occurrence of a repeating event gets its own card.
  const overdueItems = useMemo(() => {
    if (!data) return [];
    const nowIso = new Date(now).toISOString();
    return data.reminders
      .filter((r) => r.fire_at <= nowIso && !r.completed)
      .sort((a, b) => (a.fire_at < b.fire_at ? 1 : -1))
      .map((r) => ({ reminder: r, event: eventsMap.get(r.event_id) }));
  }, [data, eventsMap, now]);

  // overdueCount == overdueItems.length; kept as a separate memo so the badge
  // effect below stays a pure number dependency (avoids re-running on non-count changes).
  const overdueCount = useMemo(() => {
    if (!data) return 0;
    const nowIso = new Date(now).toISOString();
    return data.reminders.filter((r) => r.fire_at <= nowIso && !r.completed).length;
  }, [data, now]);

  useEffect(() => { setBadge(overdueCount); }, [overdueCount]);

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-6">
      {/* Notification banner */}
      {showNotifBanner && (
        <div className={`mb-4 rounded-lg border px-4 py-3 text-sm ${isIOSChrome() ? "border-amber-200 bg-amber-50" : "border-accent/30 bg-accent-soft"}`}>
          {isIOSChrome() ? (
            <div className="flex items-start gap-3">
              <span className="flex-1 text-amber-800">
                📱 <strong>Chrome on iPhone can&apos;t send notifications.</strong> Open this page in <strong>Safari</strong>, tap <strong>⎙ Share → Add to Home Screen</strong>, then enable notifications from the Home Screen app.
              </span>
              <button type="button" onClick={() => setBannerDismissed(true)} aria-label="Dismiss" className="shrink-0 text-amber-400 hover:text-amber-600">✕</button>
            </div>
          ) : isIOS() && !isStandalone() ? (
            <div className="flex items-start gap-3">
              <span className="flex-1 text-gray-700">
                📲 To get reminders on iPhone: tap <strong>⎙ Share → Add to Home Screen</strong>, then open the app from your Home Screen.
              </span>
              <button type="button" onClick={() => setBannerDismissed(true)} aria-label="Dismiss" className="shrink-0 text-gray-400 hover:text-gray-600">✕</button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <span className="flex-1 text-gray-700">
                🔔 Enable notifications so I can remind you on time.
              </span>
              <button
                type="button"
                onClick={handleEnableNotifications}
                className="shrink-0 rounded-md bg-accent px-3 py-1 text-sm font-medium text-white hover:bg-accent-hover"
              >
                Enable
              </button>
              <button type="button" onClick={() => setBannerDismissed(true)} aria-label="Dismiss" className="shrink-0 text-gray-400 hover:text-gray-600">✕</button>
            </div>
          )}
        </div>
      )}

      <header className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">
            Hello{userSuffix}.
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            I&apos;m {butler}. What future reminders can I set for you?
          </p>
        </div>
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          aria-label="Open settings"
          className="rounded-full p-2 text-gray-400 hover:bg-gray-100"
        >
          <GearIcon />
        </button>
      </header>

      <section className="mb-8">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. Yoga every Tuesday 9am at Downtown Studio, remind me 1 day before, until Aug 30"
          rows={3}
          className="w-full rounded-xl border border-border bg-surface p-3 text-sm text-gray-900 focus:border-accent focus:outline-none"
        />
        <div className="mt-2 flex items-center gap-3">
          <button
            type="button"
            onClick={parse}
            disabled={parsing || !text.trim()}
            className="rounded-lg bg-accent px-5 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {parsing ? "Reading…" : "Add reminders"}
          </button>
          {error && <span className="text-sm text-red-500">{error}</span>}
        </div>
      </section>

      {drafts && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-medium text-gray-700">
            {editingId ? "Edit reminder" : "Review before saving"}
          </h2>
          <div className="flex flex-col gap-4">
            {drafts.map((dr) => (
              <EventPreviewCard
                key={dr.uid}
                event={dr.event}
                onUpdate={(next) => updateDraft(dr.uid, next)}
                onDelete={() => deleteDraft(dr.uid)}
              />
            ))}
          </div>
          <div className="mt-4 flex gap-3">
            <button
              type="button"
              onClick={confirm}
              disabled={confirming}
              className="rounded-lg bg-green-600 px-5 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              {confirming ? "Saving…" : editingId ? "Save changes" : "Confirm"}
            </button>
            <button
              type="button"
              onClick={() => {
                setDrafts(null);
                setEditingId(null);
              }}
              className="rounded-lg border border-border px-5 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </section>
      )}

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-medium text-gray-700">
          {new Date().getFullYear()}
        </h2>
        <YearGrid
          reminders={data?.reminders ?? []}
          events={data?.events ?? []}
          onCellClick={openDetailByDate}
          nowMs={now}
        />
      </section>

      {/* P4: Not complete section — one card per missed occurrence, above Coming up */}
      {overdueItems.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold text-red-600">Not complete</h2>
          <ul className="flex flex-col gap-2">
            {overdueItems.map(({ reminder, event }) => (
              <li key={reminder.id}>
                <div className="flex w-full items-center rounded-lg border border-red-200 bg-red-50">
                  <button
                    type="button"
                    onClick={() => openDetailForReminder(reminder)}
                    className="flex flex-1 items-center gap-3 px-4 py-3 text-left"
                  >
                    <span
                      className="h-3 w-3 shrink-0 rounded-full"
                      style={{ backgroundColor: event?.color ?? reminder.color }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block line-clamp-2 font-medium text-gray-900">
                        {event?.title ?? reminder.title}
                      </span>
                      <span className="block text-xs text-red-500">
                        {`Missed: ${formatFriendlyDate(isoToLocalDateString(reminder.fire_at))}`}
                        {reminder.time ? ` · ${formatTime(reminder.time)}` : ""}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => completeReminder(reminder.id)}
                    aria-label="Mark as complete"
                    title="Mark as complete"
                    className="shrink-0 px-3 py-3 text-red-300 transition-colors hover:text-green-600"
                  >
                    <CheckIcon />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-sm font-medium text-gray-700">Coming up</h2>
        <UpcomingList
          upcoming={groupedUpcoming}
          onSelect={openDetailByReminder}
          onComplete={handleCompleteGroup}
        />
      </section>

      {detail && (
        <DetailModal
          title={detail.title}
          events={detail.events}
          onClose={() => setDetail(null)}
          onEdit={startEdit}
          onDelete={deleteEvent}
          onDeleteOccurrence={deleteOccurrence}
          onComplete={handleComplete}
        />
      )}

      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSaved={mergeSettings}
      />

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-xl bg-gray-900 px-5 py-3 text-sm text-white shadow-lg">
          <span>Marked as complete</span>
          <button
            type="button"
            onClick={undoComplete}
            className="font-semibold text-[#C4B3F5] hover:text-[#D5C6F8]"
          >
            Undo
          </button>
        </div>
      )}
    </main>
  );
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

function GearIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
