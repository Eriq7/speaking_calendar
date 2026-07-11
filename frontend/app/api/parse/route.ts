import { NextRequest, NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase";
import { parseWithAI } from "@/lib/ai";
import { isValidTimezone } from "@/lib/expand";
import type { ParseRequest, ParseResponse } from "@/lib/types";

export const runtime = "nodejs";

const DAILY_PARSE_LIMIT = 50;

export async function POST(req: NextRequest) {
  const supabase = getServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: ParseRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { text, timezone, today } = body;
  if (!text?.trim() || !timezone || !today) {
    return NextResponse.json(
      { error: "text, timezone and today are required" },
      { status: 400 }
    );
  }
  if (!isValidTimezone(timezone)) {
    return NextResponse.json({ error: "Invalid timezone" }, { status: 400 });
  }

  const { data: allowed, error: usageError } = await supabase.rpc("incr_parse_usage", { p_limit: DAILY_PARSE_LIMIT });
  if (usageError) return NextResponse.json({ error: "Usage check failed" }, { status: 500 });
  if (!allowed) return NextResponse.json({ error: "Daily parse limit reached. Try again tomorrow." }, { status: 429 });

  try {
    const events = await parseWithAI(text, timezone, today);
    const res: ParseResponse = { events };
    return NextResponse.json(res);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to parse text";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
