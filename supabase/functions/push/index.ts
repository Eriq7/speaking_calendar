// Supabase Edge Function — sends due Web Push reminders and backfills
// open-ended recurring reminders. Triggered by pg_cron (see 002_pg_cron.sql).
//
// Body:
//   { "mode": "send" }     — push all due, unsent reminders (default)
//   { "mode": "backfill" } — extend open-ended recurring reminders to end of next year (INV-8)

import { createClient } from "npm:@supabase/supabase-js@2";
import * as webpush from "jsr:@negrel/webpush";
import { rrulestr } from "https://esm.sh/rrule@2.8.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_MAILTO = Deno.env.get("VAPID_MAILTO") ?? "mailto:admin@example.com";

const DEFAULT_HOUR = 9;
const DEFAULT_MINUTE = 0;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

function base64urlToBytes(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const pad = (4 - (b64.length % 4)) % 4;
  return Uint8Array.from(atob(b64 + "=".repeat(pad)), (c) => c.charCodeAt(0));
}

function bytesToBase64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

async function buildAppServer(): Promise<webpush.ApplicationServer> {
  const pub = base64urlToBytes(VAPID_PUBLIC);
  const priv = base64urlToBytes(VAPID_PRIVATE);
  const x = bytesToBase64url(pub.slice(1, 33));
  const y = bytesToBase64url(pub.slice(33, 65));
  const d = bytesToBase64url(priv);
  const vapidKeys = await webpush.importVapidKeys(
    {
      publicKey: { kty: "EC", crv: "P-256", x, y },
      privateKey: { kty: "EC", crv: "P-256", x, y, d },
    },
    { extractable: false }
  );
  return webpush.ApplicationServer.new({
    contactInformation: VAPID_MAILTO,
    vapidKeys,
  });
}

interface ReminderRow {
  id: string;
  event_id: string;
  user_id: string;
  fire_at: string;
  kind: "day-of" | "early";
  days_before: number | null;  // legacy; prefer early_value/early_unit
  early_value: number | null;
  early_unit: string | null;
  title: string;
  time: string | null;
  location: string | null;
  color: string;
}

interface Subscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

interface UserSettings {
  user_id: string;
  user_name: string;
  butler_name: string;
}

function formatEarlyOffset(
  value: number | null,
  unit: string | null,
  daysBeforeFallback: number | null
): string {
  if (value != null && unit) {
    const labels: Record<string, [string, string]> = {
      minute: ["minute", "minutes"],
      hour:   ["hour",   "hours"],
      day:    ["day",    "days"],
      week:   ["week",   "weeks"],
      month:  ["month",  "months"],
    };
    const [singular, plural] = labels[unit] ?? [unit, unit + "s"];
    return `${value} ${value === 1 ? singular : plural}`;
  }
  if (daysBeforeFallback != null) {
    return `${daysBeforeFallback} ${daysBeforeFallback === 1 ? "day" : "days"}`;
  }
  return "a while";
}

function buildMessage(
  reminder: ReminderRow,
  userName: string,
  butlerName: string
): { title: string; body: string } {
  const loc = reminder.location ? ` ${reminder.location}` : "";
  if (reminder.kind === "early") {
    const offset = formatEarlyOffset(reminder.early_value, reminder.early_unit, reminder.days_before);
    return {
      title: reminder.title,
      body: `Hey ${userName}, it's ${butlerName}. In ${offset} — ${reminder.title}.`,
    };
  }
  const whenTime = reminder.time ? ` ${reminder.time}` : "";
  return {
    title: reminder.title,
    body: `Hey ${userName}, it's ${butlerName}. Today${whenTime} — ${reminder.title}.${loc}`,
  };
}

interface SendResult {
  count: number;
  delivered: number;
  failed: number;
  error?: string;
}

async function sendDue(): Promise<SendResult> {
  const nowIso = new Date().toISOString();

  const { data: due, error } = await supabase
    .from("reminders")
    .select("id, event_id, user_id, fire_at, kind, days_before, early_value, early_unit, title, time, location, color")
    .eq("sent", false)
    .eq("completed", false)
    .lte("fire_at", nowIso);
  if (error) throw error;
  if (!due || due.length === 0) return { count: 0, delivered: 0, failed: 0 };

  // Group reminders by user_id for per-user push.
  const byUser = new Map<string, ReminderRow[]>();
  for (const r of due as ReminderRow[]) {
    const list = byUser.get(r.user_id) ?? [];
    list.push(r);
    byUser.set(r.user_id, list);
  }

  // Batch-fetch settings for all relevant users.
  const userIds = [...byUser.keys()];
  const { data: settingsRows } = await supabase
    .from("settings")
    .select("user_id, user_name, butler_name")
    .in("user_id", userIds);
  const settingsByUser = new Map<string, UserSettings>();
  for (const s of (settingsRows ?? []) as UserSettings[]) {
    settingsByUser.set(s.user_id, s);
  }

  const appServer = await buildAppServer();
  const staleEndpoints = new Set<string>();
  let totalDelivered = 0;
  let totalFailed = 0;
  let lastError: string | undefined;

  for (const [userId, userReminders] of byUser) {
    const settings = settingsByUser.get(userId);
    const userName = settings?.user_name ?? "friend";
    const butlerName = settings?.butler_name ?? "Alfred";

    // Fetch this user's push subscriptions.
    const { data: subs } = await supabase
      .from("subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("user_id", userId);
    const subscriptions = (subs ?? []) as Subscription[];

    // Compute the absolute "not complete" badge count for this user.
    const { count: badgeCount } = await supabase
      .from("reminders")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("completed", false)
      .lte("fire_at", nowIso);
    const badge = badgeCount ?? 0;

    for (const reminder of userReminders) {
      const message = buildMessage(reminder, userName, butlerName);
      const payload = JSON.stringify({ ...message, color: reminder.color, badge });

      const results = await Promise.all(
        subscriptions.map(async (sub) => {
          try {
            const subscriber = appServer.subscribe({
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            });
            await subscriber.pushTextMessage(payload, {});
            return true;
          } catch (err) {
            const status = (err as { response?: { status?: number } })?.response?.status;
            if (status === 404 || status === 410) staleEndpoints.add(sub.endpoint);
            lastError = status ? `push ${status}` : String(err);
            return false;
          }
        })
      );

      const succeeded = results.filter(Boolean).length;
      totalDelivered += succeeded;
      totalFailed += results.length - succeeded;

      // INV-4: mark sent only after at least one successful delivery.
      if (results.some(Boolean)) {
        await supabase
          .from("reminders")
          .update({ sent: true })
          .eq("id", reminder.id);
      }
    }
  }

  if (staleEndpoints.size > 0) {
    await supabase
      .from("subscriptions")
      .delete()
      .in("endpoint", [...staleEndpoints]);
  }

  return { count: due.length, delivered: totalDelivered, failed: totalFailed, error: lastError };
}

// INV-1 / INV-7: convert a local wall time in `tz` to a UTC ISO string.
function wallTimeToUtcIso(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  tz: string
): string {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(new Date(guess));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUTC = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") === 24 ? 0 : get("hour"),
    get("minute"),
    get("second")
  );
  return new Date(guess - (asUTC - guess)).toISOString();
}

// Re-expand open-ended recurring events so their reminders reach end of next year (INV-8).
// Uses each event owner's settings.timezone to preserve INV-1/INV-2.
async function backfill(): Promise<number> {
  const { data: events, error } = await supabase
    .from("events")
    .select("*")
    .not("rrule", "is", null)
    .is("repeat_end_date", null);
  if (error) throw error;
  if (!events || events.length === 0) return 0;

  // Batch-fetch timezone for each distinct owner.
  const ownerIds = [...new Set(events.map((ev) => ev.user_id))];
  const { data: settingsRows } = await supabase
    .from("settings")
    .select("user_id, timezone")
    .in("user_id", ownerIds);
  const tzByUser = new Map<string, string>();
  for (const s of (settingsRows ?? []) as { user_id: string; timezone: string }[]) {
    tzByUser.set(s.user_id, s.timezone ?? "UTC");
  }

  const endOfNextYear = new Date(Date.UTC(new Date().getUTCFullYear() + 1, 11, 31, 23, 59, 59));
  const MAX_ROWS = 500;
  const HIGH_FREQ_HORIZON_MS = 30 * 24 * 3600 * 1000;
  let added = 0;

  for (const ev of events) {
    const tz = tzByUser.get(ev.user_id) ?? "UTC";

    const [y, mo, d] = ev.date.split("-").map(Number);
    const dtstart = new Date(Date.UTC(y, mo - 1, d, 0, 0, 0));
    const rule = rrulestr(ev.rrule, { dtstart });

    // Cap horizon for high-frequency rules to prevent row explosion.
    const freqMatch = (ev.rrule as string).toUpperCase().match(/FREQ=([A-Z]+)/);
    const freq = freqMatch ? freqMatch[1] : "";
    let limit = endOfNextYear;
    if (freq === "MINUTELY" || freq === "HOURLY") {
      const shortHorizon = new Date(Date.now() + HIGH_FREQ_HORIZON_MS);
      if (shortHorizon < limit) limit = shortHorizon;
    }

    // Build set of excluded occurrence dates (YYYY-MM-DD) to skip.
    const excludedDates = new Set<string>((ev.excluded_dates ?? []) as string[]);

    const occurrences = rule.between(dtstart, limit, true).slice(0, MAX_ROWS);

    const { data: existing } = await supabase
      .from("reminders")
      .select("fire_at")
      .eq("event_id", ev.id)
      .eq("kind", "day-of");
    const existingTimes = new Set((existing ?? []).map((r) => r.fire_at));

    const [hh, mm] = ev.time
      ? ev.time.split(":").map(Number)
      : [DEFAULT_HOUR, DEFAULT_MINUTE];

    const newRows = [];
    for (const occ of occurrences) {
      // Skip individually-deleted occurrences.
      const occDateStr = [
        occ.getUTCFullYear(),
        String(occ.getUTCMonth() + 1).padStart(2, "0"),
        String(occ.getUTCDate()).padStart(2, "0"),
      ].join("-");
      if (excludedDates.has(occDateStr)) continue;

      const fireAt = wallTimeToUtcIso(
        occ.getUTCFullYear(),
        occ.getUTCMonth() + 1,
        occ.getUTCDate(),
        hh,
        mm,
        tz
      );
      if (existingTimes.has(fireAt)) continue;
      newRows.push({
        event_id: ev.id,
        user_id: ev.user_id,
        fire_at: fireAt,
        kind: "day-of",
        days_before: null,
        title: ev.title,
        time: ev.time,
        location: ev.location,
        color: ev.color,
      });
    }

    if (newRows.length > 0) {
      await supabase.from("reminders").insert(newRows);
      added += newRows.length;
    }
  }

  return added;
}

Deno.serve(async (req) => {
  let mode = "send";
  try {
    const body = await req.json();
    if (body?.mode) mode = body.mode;
  } catch {
    // no body → default send
  }

  try {
    if (mode === "backfill") {
      const count = await backfill();
      return new Response(JSON.stringify({ mode, count }), {
        headers: { "Content-Type": "application/json" },
      });
    } else {
      const result = await sendDue();
      return new Response(JSON.stringify({ mode, ...result }), {
        headers: { "Content-Type": "application/json" },
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
