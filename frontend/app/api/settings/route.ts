import { NextRequest, NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase";
import { isValidTimezone } from "@/lib/expand";
import type { Settings } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = getServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("settings")
    .select("user_name, butler_name, timezone")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const res: Settings = {
    user_name: data?.user_name ?? "friend",
    butler_name: data?.butler_name ?? "Alfred",
    timezone: data?.timezone ?? "UTC",
  };
  return NextResponse.json(res);
}

export async function PUT(req: NextRequest) {
  const supabase = getServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Partial<Settings>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const patch: Partial<Settings> = {};
  if (typeof body.user_name === "string") patch.user_name = body.user_name;
  if (typeof body.butler_name === "string") patch.butler_name = body.butler_name;
  if (typeof body.timezone === "string") {
    if (!isValidTimezone(body.timezone)) {
      return NextResponse.json({ error: "Invalid timezone" }, { status: 400 });
    }
    patch.timezone = body.timezone;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json(
      { error: "user_name, butler_name or timezone is required" },
      { status: 400 }
    );
  }

  // Upsert so the row is created if the trigger somehow didn't fire.
  const { error } = await supabase
    .from("settings")
    .upsert({ user_id: user.id, ...patch }, { onConflict: "user_id" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
