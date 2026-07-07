import { NextRequest, NextResponse } from "next/server";
import { parseWithAI } from "@/lib/ai";
import { isValidTimezone } from "@/lib/expand";
import type { ParseRequest, ParseResponse } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
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

  try {
    const events = await parseWithAI(text, timezone, today);
    const res: ParseResponse = { events };
    return NextResponse.json(res);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to parse text";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
