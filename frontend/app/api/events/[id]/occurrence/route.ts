import { NextRequest, NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase";
import { expandReminders, isValidTimezone } from "@/lib/expand";
import type { DBEvent } from "@/lib/types";

export const runtime = "nodejs";

/**
 * DELETE /api/events/[id]/occurrence
 * Body: { date: "YYYY-MM-DD", timezone: string }
 *
 * Adds `date` to the event's excluded_dates array (preventing backfill from
 * recreating it) and deletes any unsent/uncompleted reminders for that
 * occurrence.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const supabase = getServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { date: string; timezone: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { date, timezone } = body;
  if (!date || !timezone) {
    return NextResponse.json({ error: "date and timezone are required" }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });
  }
  if (!isValidTimezone(timezone)) {
    return NextResponse.json({ error: "Invalid timezone" }, { status: 400 });
  }

  // Fetch the event (RLS ensures only the owner can access it).
  const { data: ev, error: fetchErr } = await supabase
    .from("events")
    .select("*")
    .eq("id", id)
    .single();
  if (fetchErr || !ev) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  // Compute the fire_at timestamps for this occurrence using the existing expand logic.
  const syntheticEvent = { ...ev as DBEvent, rrule: null as string | null, date };
  const occReminders = expandReminders(syntheticEvent, timezone);
  const fireAts = occReminders.map((r) => r.fire_at);

  // Delete the unsent/uncompleted reminders for this occurrence.
  if (fireAts.length > 0) {
    const { error: delErr } = await supabase
      .from("reminders")
      .delete()
      .eq("event_id", id)
      .eq("sent", false)
      .eq("completed", false)
      .in("fire_at", fireAts);
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });
  }

  // Append date to excluded_dates (deduped) to prevent backfill from recreating it.
  const current: string[] = ev.excluded_dates ?? [];
  if (!current.includes(date)) {
    const { error: updateErr } = await supabase
      .from("events")
      .update({ excluded_dates: [...current, date] })
      .eq("id", id);
    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
