import { NextRequest, NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase";

export const runtime = "nodejs";

interface SubscribeBody {
  subscription: {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  };
}

// POST /api/subscribe — register or refresh a push subscription for the current user.
export async function POST(req: NextRequest) {
  const supabase = getServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: SubscribeBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const sub = body.subscription;
  if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
    return NextResponse.json(
      { error: "A subscription with endpoint and keys is required" },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .from("subscriptions")
    .upsert(
      {
        user_id: user.id,
        endpoint: sub.endpoint,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
      },
      { onConflict: "endpoint" }
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

// DELETE /api/subscribe — remove all push subscriptions for the current user (on sign-out).
export async function DELETE() {
  const supabase = getServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await supabase
    .from("subscriptions")
    .delete()
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
