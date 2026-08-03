import { NextRequest, NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase";
import { expandReminders, isValidTimezone } from "@/lib/expand";
import type { DBEvent, EventInput } from "@/lib/types";

export const runtime = "nodejs";

const EVENT_FIELDS: (keyof EventInput)[] = [
  "title",
  "note",
  "date",
  "time",
  "location",
  "early_value",
  "early_unit",
  "rrule",
  "repeat_end_date",
  "color",
];

type UpdateBody = Partial<EventInput> & { timezone: string };

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const supabase = getServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: UpdateBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { timezone } = body;
  if (!timezone) return NextResponse.json({ error: "timezone is required" }, { status: 400 });
  if (!isValidTimezone(timezone)) return NextResponse.json({ error: "Invalid timezone" }, { status: 400 });

  // RLS ensures this only finds the current user's event.
  const { data: existing, error: fetchErr } = await supabase
    .from("events")
    .select("*")
    .eq("id", id)
    .single();
  if (fetchErr || !existing) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  const patch: Partial<EventInput> = {};
  for (const field of EVENT_FIELDS) {
    if (field in body) {
      // @ts-expect-error indexed assignment across the union is safe here
      patch[field] = body[field];
    }
  }

  const { data: updated, error: updateErr } = await supabase
    .from("events")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (updateErr || !updated) {
    return NextResponse.json(
      { error: updateErr?.message ?? "Failed to update event" },
      { status: 500 }
    );
  }

  // INV-5: drop unsent AND uncompleted reminders, then re-expand from the updated event.
  const { error: delErr } = await supabase
    .from("reminders")
    .delete()
    .eq("event_id", id)
    .eq("sent", false)
    .eq("completed", false);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  const merged = updated as DBEvent;
  const nowMs = Date.now();
  const reminders = expandReminders(merged, timezone)
    .filter((r) => new Date(r.fire_at).getTime() >= nowMs)
    .map((r) => ({
      ...r,
      event_id: id,
      user_id: user.id,
    }));
  if (reminders.length > 0) {
    const { error: remErr } = await supabase
      .from("reminders")
      .upsert(reminders, { onConflict: "event_id,kind,fire_at", ignoreDuplicates: true });
    if (remErr) return NextResponse.json({ error: remErr.message }, { status: 500 });
  }

  return NextResponse.json({ event: merged });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const supabase = getServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // INV-6: remove pending reminders, then the event.
  const { error: remErr } = await supabase
    .from("reminders")
    .delete()
    .eq("event_id", id)
    .eq("sent", false);
  if (remErr) return NextResponse.json({ error: remErr.message }, { status: 500 });

  const { error: evtErr } = await supabase.from("events").delete().eq("id", id);
  if (evtErr) return NextResponse.json({ error: evtErr.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
