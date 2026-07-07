"use client";

import { useEffect, useState } from "react";
import { Settings } from "@/lib/types";

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
  onSaved: (patch: Partial<Settings>) => void;
}

const EXAMPLES = [
  "Dentist appointment next Tuesday at 9am, remind me 1 day before",
  "Team standup every weekday at 10am",
  "Mom's birthday on August 12, remind me 3 days early",
  "Gym Monday, Wednesday and Friday at 7pm",
  "Pay rent on the 1st of every month",
  "Flight to Tokyo on Sep 3 at 6:30pm from SFO",
  "Water the plants every 3 days",
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

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <aside
        className="h-full w-full max-w-sm overflow-y-auto bg-white p-6 shadow-xl"
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

        <section className="mb-8">
          <h3 className="mb-2 text-sm font-medium text-gray-700">Your names</h3>
          <label className="mb-1 block text-xs text-gray-500">Your name</label>
          <input
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
            placeholder="e.g. Vivian"
            className="mb-3 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none"
          />
          <label className="mb-1 block text-xs text-gray-500">Butler name</label>
          <input
            value={butlerName}
            onChange={(e) => setButlerName(e.target.value)}
            placeholder="e.g. Alfred"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="mt-3 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </section>

        <section>
          <h3 className="mb-2 text-sm font-medium text-gray-700">How to use</h3>
          <p className="mb-3 text-xs text-gray-500">
            Just type what you want to remember in plain English. Try things like:
          </p>
          <ul className="flex flex-col gap-2">
            {EXAMPLES.map((ex) => (
              <li
                key={ex}
                className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700"
              >
                “{ex}”
              </li>
            ))}
          </ul>
        </section>
      </aside>
    </div>
  );
}
