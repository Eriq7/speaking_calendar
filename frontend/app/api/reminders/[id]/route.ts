import { NextRequest, NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase";

export const runtime = "nodejs";

// PATCH /api/reminders/:id  — toggle completed on a single reminder occurrence.
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const supabase = getServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { completed?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body.completed !== "boolean") {
    return NextResponse.json(
      { error: "completed (boolean) is required" },
      { status: 400 }
    );
  }

  // RLS ensures the user can only update their own reminders.
  const { error } = await supabase
    .from("reminders")
    .update({ completed: body.completed })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
