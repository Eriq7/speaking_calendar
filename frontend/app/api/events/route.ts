import { NextRequest, NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase";
import { expandReminders, isValidTimezone } from "@/lib/expand";
import type {
  CreateEventsRequest,
  DBEvent,
  DBReminder,
  EventsResponse,
  UpcomingReminder,
} from "@/lib/types";

export const runtime = "nodejs";

// Safety cap — expansion is already bounded by end-of-next-year horizon + ≤500 rows/event.
const UPCOMING_MAX = 500;

export async function GET() {
  const supabase = getServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const year = new Date().getUTCFullYear();
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  const nowIso = new Date().toISOString();

  const [eventsRes, remindersRes, upcomingRes] = await Promise.all([
    supabase
      .from("events")
      .select("*")
      .gte("date", yearStart)
      .lte("date", yearEnd)
      .order("date", { ascending: true }),
    supabase
      .from("reminders")
      .select("*")
      .eq("kind", "day-of")
      .gte("fire_at", `${yearStart}T00:00:00Z`)
      .lte("fire_at", `${yearEnd}T23:59:59Z`),
    supabase
      .from("reminders")
      .select("id, event_id, fire_at, title, time, location, color, kind, completed")
      .eq("completed", false)
      .gt("fire_at", nowIso)
      .order("fire_at", { ascending: true })
      .limit(UPCOMING_MAX),
  ]);

  const error = eventsRes.error || remindersRes.error || upcomingRes.error;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const res: EventsResponse = {
    events: (eventsRes.data ?? []) as DBEvent[],
    reminders: (remindersRes.data ?? []) as DBReminder[],
    upcoming: (upcomingRes.data ?? []) as UpcomingReminder[],
  };
  return NextResponse.json(res);
}

export async function POST(req: NextRequest) {
  const supabase = getServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: CreateEventsRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { events, timezone } = body;
  if (!Array.isArray(events) || events.length === 0 || !timezone) {
    return NextResponse.json(
      { error: "events (non-empty) and timezone are required" },
      { status: 400 }
    );
  }
  if (!isValidTimezone(timezone)) {
    return NextResponse.json({ error: "Invalid timezone" }, { status: 400 });
  }

  const eventIds: string[] = [];

  for (const event of events) {
    const { data: inserted, error: insertErr } = await supabase
      .from("events")
      .insert({
        user_id: user.id,
        title: event.title,
        note: event.note,
        date: event.date,
        time: event.time,
        location: event.location,
        early_value: event.early_value,
        early_unit: event.early_unit,
        rrule: event.rrule,
        repeat_end_date: event.repeat_end_date,
        color: event.color,
      })
      .select("id")
      .single();

    if (insertErr || !inserted) {
      return NextResponse.json(
        { error: insertErr?.message ?? "Failed to insert event" },
        { status: 500 }
      );
    }

    const eventId = inserted.id as string;
    eventIds.push(eventId);

    const reminders = expandReminders(event, timezone).map((r) => ({
      ...r,
      event_id: eventId,
      user_id: user.id,
    }));

    if (reminders.length > 0) {
      const { error: remErr } = await supabase.from("reminders").insert(reminders);
      if (remErr) return NextResponse.json({ error: remErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({ eventIds });
}
