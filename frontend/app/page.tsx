"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DBEvent,
  EventInput,
  EventsResponse,
  ParseResponse,
  Settings,
  UpcomingReminder,
} from "@/lib/types";
import {
  getLocalTimezone,
  todayLocalString,
  isoToLocalDateString,
  formatFriendlyDate,
} from "@/lib/date";
import { initPushNotifications } from "@/lib/push";
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
    early_reminder: ev.early_reminder,
    rrule: ev.rrule,
    repeat_end_date: ev.repeat_end_date,
    color: ev.color,
  };
}

interface DetailState {
  title: string;
  events: DBEvent[];
}

interface Draft {
  uid: string;
  event: EventInput;
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

  const loadEvents = useCallback(async () => {
    const res = await fetch("/api/events");
    if (res.ok) setData(await res.json());
  }, []);

  // INV-13: request notification permission on first load.
  useEffect(() => {
    initPushNotifications();
  }, []);

  useEffect(() => {
    loadEvents();
    fetch("/api/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((s: Settings | null) => s && setSettings(s))
      .catch(() => {});

    // Persist the browser timezone so the Edge Function backfill computes
    // fire_at in the user's local time (INV-1 / KP-3).
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

  const openDetailByDate = (date: string) => {
    if (!data) return;
    // Match day-of reminders only, consistent with the grid coloring.
    const eventIds = new Set(
      data.reminders
        .filter(
          (r) => r.kind === "day-of" && isoToLocalDateString(r.fire_at) === date
        )
        .map((r) => r.event_id)
    );
    const events = data.events.filter((e) => eventIds.has(e.id));
    if (events.length === 0) return;
    setDetail({ title: formatFriendlyDate(date), events });
  };

  const openDetailByReminder = (r: UpcomingReminder) => {
    if (!data) return;
    const events = data.events.filter((e) => e.id === r.event_id);
    setDetail({ title: r.title, events });
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

  const butler = settings?.butler_name?.trim() || "your butler";
  const userSuffix = settings?.user_name?.trim()
    ? `, ${settings.user_name.trim()}`
    : "";

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-6">
      <header className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">
            Hello{userSuffix}.
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            I&apos;m {butler}. What future reminders can I set for you?
          </p>
        </div>
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          aria-label="Open settings"
          className="rounded-full p-2 text-gray-500 hover:bg-gray-100"
        >
          <GearIcon />
        </button>
      </header>

      <section className="mb-8">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. Dentist next Tuesday at 9am, remind me 1 day before"
          rows={3}
          className="w-full rounded-xl border border-gray-300 p-3 text-sm text-gray-900 focus:border-gray-500 focus:outline-none"
        />
        <div className="mt-2 flex items-center gap-3">
          <button
            type="button"
            onClick={parse}
            disabled={parsing || !text.trim()}
            className="rounded-lg bg-gray-900 px-5 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
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
              className="rounded-lg border border-gray-300 px-5 py-2 text-sm text-gray-700 hover:bg-gray-50"
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
          onCellClick={openDetailByDate}
        />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium text-gray-700">Coming up</h2>
        <UpcomingList
          upcoming={data?.upcoming ?? []}
          onSelect={openDetailByReminder}
        />
      </section>

      {detail && (
        <DetailModal
          title={detail.title}
          events={detail.events}
          onClose={() => setDetail(null)}
          onEdit={startEdit}
          onDelete={deleteEvent}
        />
      )}

      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSaved={mergeSettings}
      />
    </main>
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
