"use client";

import { useState } from "react";
import { COLOR_PRESETS } from "@/lib/colors";

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
}

export default function ColorPicker({ value, onChange }: ColorPickerProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Choose color"
        onClick={() => setOpen((o) => !o)}
        className="h-8 w-8 rounded-full border-2 border-white shadow ring-1 ring-black/10"
        style={{ backgroundColor: value }}
      />
      {open && (
        <div className="absolute z-20 mt-2 grid grid-cols-4 gap-2 rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
          {COLOR_PRESETS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={c}
              onClick={() => {
                onChange(c);
                setOpen(false);
              }}
              className={`h-7 w-7 rounded-full ring-2 ${
                value.toLowerCase() === c.toLowerCase()
                  ? "ring-gray-800"
                  : "ring-transparent"
              }`}
              style={{ backgroundColor: c }}
            />
          ))}
          <label className="col-span-4 mt-1 flex items-center gap-2 text-xs text-gray-600">
            Custom
            <input
              type="color"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              className="h-6 w-10 cursor-pointer border-0 bg-transparent p-0"
            />
          </label>
        </div>
      )}
    </div>
  );
}
