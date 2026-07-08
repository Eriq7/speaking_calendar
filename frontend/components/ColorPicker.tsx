"use client";

import { useRef, useState } from "react";
import { COLOR_PRESETS } from "@/lib/colors";

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
}

export default function ColorPicker({ value, onChange }: ColorPickerProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"presets" | "custom">("presets");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleCustomClick = () => {
    setMode("custom");
    // Programmatically open the native color picker (user gesture is already in progress).
    setTimeout(() => inputRef.current?.click(), 0);
  };

  const handleBackToPresets = () => {
    setMode("presets");
  };

  const handleClose = () => {
    setOpen(false);
    setMode("presets");
  };

  return (
    <div className="relative">
      {/* Trigger swatch */}
      <button
        type="button"
        aria-label="Choose color"
        onClick={() => setOpen((o) => !o)}
        className="h-8 w-8 rounded-full border-2 border-white shadow ring-1 ring-black/10"
        style={{ backgroundColor: value }}
      />

      {open && (
        <>
          {/* Click-outside overlay */}
          <div className="fixed inset-0 z-10" onClick={handleClose} />

          <div className="absolute left-0 z-20 mt-2 w-44 rounded-xl border border-border bg-surface p-3 shadow-lg">
            {mode === "presets" ? (
              <>
                {/* 8 preset swatches in two rows of 4 — explicit width ensures they fit */}
                <div className="flex flex-wrap gap-2">
                  {COLOR_PRESETS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      aria-label={c}
                      onClick={() => {
                        onChange(c);
                        handleClose();
                      }}
                      className={`h-7 w-7 shrink-0 rounded-full ring-2 transition-transform hover:scale-110 ${
                        value.toLowerCase() === c.toLowerCase()
                          ? "ring-accent"
                          : "ring-transparent"
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>

                {/* Divider */}
                <div className="my-2 border-t border-border" />

                {/* Custom button */}
                <button
                  type="button"
                  onClick={handleCustomClick}
                  className="w-full rounded-md px-2 py-1.5 text-left text-sm text-gray-600 hover:bg-gray-50"
                >
                  Custom…
                </button>
              </>
            ) : (
              <>
                {/* Custom mode: show current color + back link */}
                <div className="mb-3 flex items-center gap-3">
                  <div
                    className="h-10 w-10 shrink-0 rounded-full ring-1 ring-black/10"
                    style={{ backgroundColor: value }}
                  />
                  <span className="text-xs text-gray-500">
                    {value.toUpperCase()}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleBackToPresets}
                  className="w-full rounded-md px-2 py-1.5 text-left text-sm text-accent hover:bg-blue-50"
                >
                  ← Back to presets
                </button>
              </>
            )}

            {/* Hidden native color input — always mounted so programmatic .click() works */}
            <input
              ref={inputRef}
              type="color"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              className="sr-only"
              tabIndex={-1}
              aria-hidden
            />
          </div>
        </>
      )}
    </div>
  );
}
