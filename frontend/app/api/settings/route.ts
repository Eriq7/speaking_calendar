import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { isValidTimezone } from "@/lib/expand";
import type { Settings } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("settings")
    .select("user_name, butler_name, timezone")
    .eq("id", true)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const res: Settings = {
    user_name: data.user_name,
    butler_name: data.butler_name,
    timezone: data.timezone,
  };
  return NextResponse.json(res);
}

export async function PUT(req: NextRequest) {
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

  const supabase = getServiceClient();
  const { error } = await supabase
    .from("settings")
    .update(patch)
    .eq("id", true);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
