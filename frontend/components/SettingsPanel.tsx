"use client";

import { useEffect, useState } from "react";
import { Settings } from "@/lib/types";
import { enableNotifications, isIOS, isIOSChrome, isStandalone } from "@/lib/push";
import { getBrowserClient } from "@/lib/supabase-browser";

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
  onSaved: (patch: Partial<Settings>) => void;
}

const EXAMPLES = [
  "Dentist appointment next Tuesday at 9am, remind me 1 day before",
  "Gym Monday, Wednesday and Friday at 7pm",
  "Pay rent on the 1st of every month",
  "Water the plants every 3 days",
  "Flight to Tokyo on Sep 3 at 6:30pm from SFO",
];

export default function SettingsPanel({
  open,
  onClose,
  onSaved,
}: SettingsPanelProps) {
  const [userName, setUserName] = useState("");
  const [butlerName, setButlerName] = useState("");
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [notifStatus, setNotifStatus] = useState<"idle" | "granted" | "denied">("idle");
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    if (!open || loaded) return;
    fetch("/api/settings")
      .then((r) => r.json())
      .then((s: Settings) => {
        setUserName(s.user_name ?? "");
        setButlerName(s.butler_name ?? "");
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [open, loaded]);

  // Reflect current permission status whenever the panel opens.
  useEffect(() => {
    if (!open) return;
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission === "granted") setNotifStatus("granted");
    else if (Notification.permission === "denied") setNotifStatus("denied");
    else setNotifStatus("idle");
  }, [open]);

  const save = async () => {
    setSaving(true);
    const body = { user_name: userName, butler_name: butlerName };
    try {
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      onSaved(body);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleEnableNotifications = async () => {
    const perm = await enableNotifications();
    if (perm === "granted") setNotifStatus("granted");
    else if (perm === "denied") setNotifStatus("denied");
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    // Unsubscribe push on this device and remove from DB.
    try {
      if ("serviceWorker" in navigator && "PushManager" in window) {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) await sub.unsubscribe();
      }
    } catch {}
    await fetch("/api/subscribe", { method: "DELETE" }).catch(() => {});
    await getBrowserClient().auth.signOut();
    window.location.href = "/login";
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <aside
        className="h-full w-full max-w-sm overflow-y-auto bg-surface p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Settings</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="rounded-md px-2 py-1 text-gray-400 hover:bg-gray-100"
          >
            ✕
          </button>
        </div>

        {/* Names */}
        <section className="mb-6">
          <h3 className="mb-2 text-sm font-medium text-gray-700">Your names</h3>
          <label className="mb-1 block text-xs text-gray-500">Your name</label>
          <input
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
            placeholder="e.g. Vivian"
            className="mb-3 w-full rounded-md border border-border px-3 py-2 text-sm text-gray-900 focus:border-accent focus:outline-none"
          />
          <label className="mb-1 block text-xs text-gray-500">Butler name</label>
          <input
            value={butlerName}
            onChange={(e) => setButlerName(e.target.value)}
            placeholder="e.g. Alfred"
            className="w-full rounded-md border border-border px-3 py-2 text-sm text-gray-900 focus:border-accent focus:outline-none"
          />
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="mt-3 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </section>

        {/* Notifications */}
        <section className="mb-6">
          <h3 className="mb-2 text-sm font-medium text-gray-700">Notifications</h3>
          {isIOSChrome() ? (
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 text-xs text-amber-800 leading-relaxed">
              <p className="font-medium mb-1">📱 iPhone requires Safari</p>
              <p>Chrome on iPhone cannot send notifications. To get reminders:</p>
              <ol className="mt-1.5 ml-3 list-decimal space-y-1">
                <li>Open this page in <strong>Safari</strong></li>
                <li>Tap the share button <strong>⎙</strong> at the bottom</li>
                <li>Tap <strong>&ldquo;Add to Home Screen&rdquo;</strong></li>
                <li>Open the app from your Home Screen and enable notifications there</li>
              </ol>
            </div>
          ) : isIOS() && !isStandalone() ? (
            <div className="rounded-lg bg-accent-soft border border-accent/30 px-3 py-2.5 text-xs text-gray-700 leading-relaxed">
              <p className="font-medium mb-1">📲 Add to Home Screen first</p>
              <p>To receive notifications on iPhone:</p>
              <ol className="mt-1.5 ml-3 list-decimal space-y-1">
                <li>Tap the share button <strong>⎙</strong> at the bottom of Safari</li>
                <li>Tap <strong>&ldquo;Add to Home Screen&rdquo;</strong></li>
                <li>Open the app from your Home Screen — notifications will be available there</li>
              </ol>
            </div>
          ) : notifStatus === "granted" ? (
            <div>
              <p className="text-xs text-green-700">✓ Notifications are enabled.</p>
              {isIOS() && (
                <p className="mt-1.5 text-xs text-gray-500">
                  If notifications aren&apos;t showing up, check: <strong>iPhone Settings → Notifications → Talk Reminder</strong> → Allow Notifications ON, Sounds ON.
                </p>
              )}
            </div>
          ) : notifStatus === "denied" ? (
            <p className="text-xs text-gray-500">
              Notifications are blocked. Enable them in your browser settings.
            </p>
          ) : (
            <div>
              <button
                type="button"
                onClick={handleEnableNotifications}
                className="rounded-md border border-accent px-3 py-1.5 text-sm text-accent hover:bg-accent-soft"
              >
                🔔 Enable notifications
              </button>
              {isIOS() && (
                <p className="mt-2 text-xs text-gray-500">
                  After allowing, also check: <strong>iPhone Settings → Notifications → Talk Reminder</strong> → Sounds ON.
                </p>
              )}
            </div>
          )}
        </section>

        {/* Sign out */}
        <section className="mb-6">
          <button
            type="button"
            onClick={handleSignOut}
            disabled={signingOut}
            className="w-full rounded-md border border-red-200 px-4 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            {signingOut ? "Signing out…" : "Sign Out"}
          </button>
        </section>

        {/* How to use */}
        <section>
          <h3 className="mb-2 text-sm font-medium text-gray-700">How to use</h3>
          <ul className="flex flex-col gap-2">
            {EXAMPLES.map((ex) => (
              <li
                key={ex}
                className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700"
              >
                &ldquo;{ex}&rdquo;
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-gray-500 italic">
            Talk to me the way you&apos;d talk to your butler — in plain, everyday words.
            I&apos;ll sort out the dates, repeats, and reminders for you.
          </p>
        </section>
      </aside>
    </div>
  );
}
