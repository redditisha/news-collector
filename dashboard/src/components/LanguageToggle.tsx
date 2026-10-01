"use client";

import { useTitleMode } from "./LanguageProvider";
import type { TitleMode } from "@/lib/types";

const OPTIONS: { mode: TitleMode; label: string; hint: string }[] = [
  { mode: "en", label: "English", hint: "Hindi/Kannada headlines shown in English where translated" },
  { mode: "original", label: "Original", hint: "Headlines as published" },
];

export function LanguageToggle() {
  const { mode, setMode } = useTitleMode();
  return (
    <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5 text-sm">
      {OPTIONS.map((o) => (
        <button
          key={o.mode}
          onClick={() => setMode(o.mode)}
          title={o.hint}
          className={`rounded-md px-3 py-1 transition ${
            mode === o.mode ? "bg-brand text-white" : "text-slate-600 hover:bg-slate-100"
          }`}
          aria-pressed={mode === o.mode}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
