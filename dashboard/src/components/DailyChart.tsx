"use client";

import Link from "next/link";
import { useState } from "react";

export interface DayStat {
  day: string; // YYYY-MM-DD (IST)
  total: number;
  sources: number;
  byLang: Record<string, number>;
  byGroup: Record<string, number>;
  topSources: { name: string; n: number }[];
}

const LANG_NAME: Record<string, string> = { en: "English", kn: "Kannada", hi: "Hindi", ta: "Tamil", te: "Telugu" };
const LANG_ORDER = ["en", "kn", "hi", "ta", "te"];
const LANG_COLOUR: Record<string, string> = {
  en: "bg-sky-500", kn: "bg-orange-400", hi: "bg-rose-400", ta: "bg-emerald-500", te: "bg-violet-400",
};

const dayLabel = (d: string, opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", ...opts }).format(new Date(`${d}T00:00:00Z`));

/**
 * Articles per day (IST publish date), stacked by language. Hover (or tap) a
 * bar for that day's breakdown; click through to the day in Archive.
 */
export function DailyChart({ days }: { days: DayStat[] }) {
  const [active, setActive] = useState<string | null>(null);
  const max = Math.max(1, ...days.map((d) => d.total));
  const langs = LANG_ORDER.filter((l) => days.some((d) => d.byLang[l])).concat(
    [...new Set(days.flatMap((d) => Object.keys(d.byLang)))].filter((l) => !LANG_ORDER.includes(l)).sort()
  );
  const total = days.reduce((s, d) => s + d.total, 0);
  const shown = days.find((d) => d.day === active) ?? null;

  return (
    <section className="mb-8 rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-ink">
          Articles per day <span className="font-normal text-slate-400">— last {days.length} days by publish date (IST)</span>
        </h2>
        <span className="text-xs text-slate-500">
          {total.toLocaleString()} total · avg {Math.round(total / Math.max(1, days.length)).toLocaleString()}/day
        </span>
      </div>

      <div className="flex flex-col gap-4 md:flex-row">
        <div className="min-w-0 flex-1">
          <div className="flex h-44 items-end gap-1" onMouseLeave={() => setActive(null)}>
            {days.map((d) => (
              <Link
                key={d.day}
                href={`/archive?date=${d.day}`}
                onMouseEnter={() => setActive(d.day)}
                onFocus={() => setActive(d.day)}
                // Touch screens have no hover: the first tap shows the breakdown, the second opens the day.
                onClick={(e) => {
                  if (active !== d.day) {
                    e.preventDefault();
                    setActive(d.day);
                  }
                }}
                className={`group flex h-full min-w-0 flex-1 flex-col justify-end rounded-t ${active === d.day ? "bg-slate-100" : ""}`}
                title={`${dayLabel(d.day, { weekday: "short", day: "numeric", month: "short" })}: ${d.total.toLocaleString()} articles`}
              >
                <span className="mb-0.5 hidden text-center text-[10px] text-slate-500 sm:block">
                  {d.total >= 1000 ? `${(d.total / 1000).toFixed(1)}k` : d.total || ""}
                </span>
                <span className="flex w-full flex-col-reverse overflow-hidden rounded-t" style={{ height: `${(d.total / max) * 100}%` }}>
                  {langs.map((l) =>
                    d.byLang[l] ? (
                      <span key={l} className={`${LANG_COLOUR[l] ?? "bg-slate-400"} w-full`} style={{ height: `${(d.byLang[l] / d.total) * 100}%` }} />
                    ) : null
                  )}
                </span>
              </Link>
            ))}
          </div>
          <div className="mt-1 flex gap-1">
            {days.map((d, i) => (
              <span key={d.day} className="min-w-0 flex-1 truncate text-center text-[10px] text-slate-400">
                {i % 2 === days.length % 2 ? "" : dayLabel(d.day, { day: "numeric", month: "short" })}
              </span>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
            {langs.map((l) => (
              <span key={l} className="flex items-center gap-1">
                <span className={`h-2 w-2 rounded-sm ${LANG_COLOUR[l] ?? "bg-slate-400"}`} />
                {LANG_NAME[l] ?? l}
              </span>
            ))}
          </div>
        </div>

        <div className="rounded-lg bg-slate-50 p-3 text-sm md:w-64">
          {shown ? (
            <>
              <div className="font-semibold text-ink">{dayLabel(shown.day, { weekday: "long", day: "numeric", month: "short" })}</div>
              <div className="mb-2 text-xs text-slate-500">
                {shown.total.toLocaleString()} articles from {shown.sources} outlets
              </div>
              <Breakdown title="Language" rows={langs.filter((l) => shown.byLang[l]).map((l) => [LANG_NAME[l] ?? l, shown.byLang[l]])} total={shown.total} />
              <Breakdown title="Group" rows={Object.entries(shown.byGroup).sort((a, b) => b[1] - a[1])} total={shown.total} />
              <Breakdown title="Top outlets" rows={shown.topSources.map((s) => [s.name, s.n])} total={shown.total} />
              <div className="mt-2 text-xs text-brand">Click the bar to read that day →</div>
            </>
          ) : (
            <p className="text-xs text-slate-400">Hover over a bar (tap on a phone) to see that day&apos;s breakdown by language, group and outlet.</p>
          )}
        </div>
      </div>
    </section>
  );
}

function Breakdown({ title, rows, total }: { title: string; rows: [string, number][]; total: number }) {
  if (!rows.length) return null;
  return (
    <div className="mb-2">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{title}</div>
      {rows.map(([name, n]) => (
        <div key={name} className="flex justify-between gap-2 text-xs">
          <span className="truncate text-slate-600">{name || "—"}</span>
          <span className="shrink-0 text-slate-500">
            {n.toLocaleString()} <span className="text-slate-400">({Math.round((n / total) * 100)}%)</span>
          </span>
        </div>
      ))}
    </div>
  );
}
