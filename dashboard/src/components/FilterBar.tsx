"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { RANGES, toQuery, type Filters } from "@/lib/filters";
import { HOSTED } from "@/lib/mode";

export interface FilterOptions {
  groups: string[];
  categories: { slug: string; group: string; name: string }[];
  sources: { id: string; name: string; language: string }[];
  languages: string[];
}

const LANG_NAME: Record<string, string> = {
  en: "English", kn: "Kannada", hi: "Hindi", ta: "Tamil", te: "Telugu", gu: "Gujarati", mr: "Marathi", ml: "Malayalam", bn: "Bengali",
};
// Show languages in this order first, then any others alphabetically.
const LANG_ORDER = ["en", "kn", "hi", "ta", "te"];

const control = "rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-brand";

/**
 * Filters shared by every section: search, dates, category, topic, sources,
 * language, order. Everything lives in the URL; changing a filter goes back
 * to page 1.
 */
export function FilterBar({
  filters,
  options,
  search = true,
  sort = true,
  dates = true,
  defaultRange = "",
  extra,
}: {
  filters: Filters;
  options: FilterOptions;
  search?: boolean;
  sort?: boolean;
  dates?: boolean; // false where the page picks the date itself (Archive)
  defaultRange?: string; // the page's own default (Today, Stories: "24h") — not counted as a filter
  extra?: Record<string, string>; // params the page needs kept (e.g. folder)
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = useState(filters.q);
  useEffect(() => setQ(filters.q), [filters.q]);

  function go(change: Partial<Filters>) {
    const qs = toQuery(filters, { ...change, page: 1 });
    const keep = extra ? new URLSearchParams(extra).toString() : "";
    router.push(`${pathname}${qs}${keep ? (qs ? "&" : "?") + keep : ""}`);
  }

  const cats = options.categories.filter((c) => !filters.group || c.group === filters.group);
  const dateMode = filters.from || filters.to ? "custom" : filters.range || "all";
  const baseRange = defaultRange || "all";
  // Phones: language + search stay visible, the rest folds behind "More filters".
  const [more, setMore] = useState(false);
  const hiddenActive = [
    filters.group, (filters.range || "all") !== baseRange || filters.from || filters.to, filters.cat, filters.src.length,
    filters.sort !== "published" || filters.order !== "desc",
  ].filter(Boolean).length;
  const filtered = !!(filters.q || filters.also.length || ((filters.range || "all") !== baseRange) || filters.from || filters.to || filters.group || filters.cat || filters.src.length || filters.lang || filters.drill.length || filters.ng);

  return (
    <div className="mb-4 space-y-2 rounded-xl border border-slate-200 bg-white p-3">
      <ChipRow
        label="Language"
        value={filters.lang}
        options={[...options.languages].sort((a, b) => (LANG_ORDER.indexOf(a) + 1 || 99) - (LANG_ORDER.indexOf(b) + 1 || 99) || a.localeCompare(b)).map((l) => ({ value: l, label: LANG_NAME[l] ?? l }))}
        onChange={(lang) => go({ lang })}
      />
      {search ? (
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            go({ q: q.trim(), also: [] });
          }}
        >
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search headlines (English or Kannada)…"
            className={`${control} w-full sm:w-auto sm:min-w-[14rem] sm:flex-1`}
          />
          <select value={filters.mode} onChange={(e) => go({ mode: e.target.value as Filters["mode"] })} className={control} title="How words are matched">
            <option value="all">All words</option>
            <option value="any">Any word</option>
            <option value="phrase">Exact phrase</option>
          </select>
          <select value={filters.fields} onChange={(e) => go({ fields: e.target.value as Filters["fields"] })} className={control} title="Where to look">
            <option value="all">Headlines + summaries</option>
            <option value="title">Headlines only</option>
          </select>
          <button type="submit" className="ml-auto rounded-lg bg-brand px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 sm:ml-0">
            Search
          </button>
        </form>
      ) : null}

      <button
        onClick={() => setMore((m) => !m)}
        className="flex w-full items-center justify-between rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 sm:hidden"
      >
        <span>
          More filters{hiddenActive ? <span className="ml-1.5 rounded-full bg-brand px-1.5 text-xs font-semibold text-white">{hiddenActive}</span> : null}
        </span>
        <span className="text-slate-400">{more ? "▴" : "▾"}</span>
      </button>
      <div className={`${more ? "block" : "hidden"} space-y-2 sm:block`}>
      <ChipRow label="Group" value={filters.group} options={options.groups.map((g) => ({ value: g, label: g }))} onChange={(group) => go({ group, cat: "" })} />
      <div className="flex flex-wrap items-center gap-2">
        {dates ? (
          <>
        <div className="no-scrollbar flex max-w-full overflow-x-auto rounded-lg border border-slate-300 text-sm">
          {/* Online, a page shows at most a week (each day is a sheet tab to load). */}
          {(HOSTED ? RANGES.filter((r) => r.hours <= 24 * 7) : [{ value: "all", label: "All time" }, ...RANGES]).map((r) => (
            <button
              key={r.value}
              // "all" is written to the URL explicitly so it overrides a page's default range.
              onClick={() => go({ range: r.value, from: "", to: "" })}
              className={`shrink-0 whitespace-nowrap px-2.5 py-1.5 ${dateMode === r.value ? "bg-brand text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1 text-xs text-slate-500">
          From
          <input type="date" value={filters.from} onChange={(e) => go({ from: e.target.value, range: "" })} className={control} />
        </label>
        <label className="flex items-center gap-1 text-xs text-slate-500">
          To
          <input type="date" value={filters.to} onChange={(e) => go({ to: e.target.value, range: "" })} className={control} />
        </label>

          </>
        ) : null}
        <select value={filters.cat} onChange={(e) => go({ cat: e.target.value })} className={control}>
          <option value="">All topics</option>
          {cats.map((c) => (
            <option key={c.slug} value={c.slug}>{c.name}</option>
          ))}
        </select>
        <SourcePicker selected={filters.src} sources={options.sources} onChange={(src) => go({ src })} />
        {sort ? (
          <select
            value={`${filters.sort}:${filters.order}`}
            onChange={(e) => {
              const [sort, order] = e.target.value.split(":") as [Filters["sort"], Filters["order"]];
              go({ sort, order });
            }}
            className={control}
            title="Order"
          >
            <option value="published:desc">Newest published first</option>
            <option value="published:asc">Oldest published first</option>
            <option value="fetched:desc">Newest collected first</option>
            <option value="fetched:asc">Oldest collected first</option>
          </select>
        ) : null}
        {filtered ? (
          <button
            onClick={() => go({ q: "", also: [], range: defaultRange, from: "", to: "", group: "", cat: "", src: [], lang: "", mode: "all", fields: "all", drill: [], ng: "" })}
            className="text-sm text-slate-500 underline hover:text-slate-800"
          >
            Clear filters
          </button>
        ) : null}
      </div>
      </div>
    </div>
  );
}

/** Multi-select of sources with a type-to-filter box. */
function SourcePicker({
  selected,
  sources,
  onChange,
}: {
  selected: string[];
  sources: FilterOptions["sources"];
  onChange: (src: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [picked, setPicked] = useState<string[]>(selected);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => setPicked(selected), [selected]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        if (picked.join() !== selected.join()) onChange(picked);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open, picked, selected, onChange]);

  const shown = sources.filter((s) => s.name.toLowerCase().includes(text.toLowerCase()));
  const label = selected.length === 0 ? "All sources" : selected.length === 1 ? sources.find((s) => s.id === selected[0])?.name ?? "1 source" : `${selected.length} sources`;

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className={`${control} max-w-[12rem] truncate`}>
        {label} ▾
      </button>
      {open ? (
        <div className="absolute z-30 mt-1 w-72 max-w-[calc(100vw-2rem)] rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
          <input
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Filter sources…"
            className={`${control} mb-2 w-full`}
          />
          <div className="max-h-72 overflow-y-auto">
            {shown.map((s) => (
              <label key={s.id} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={picked.includes(s.id)}
                  onChange={(e) => setPicked((p) => (e.target.checked ? [...p, s.id] : p.filter((x) => x !== s.id)))}
                />
                <span className="flex-1 truncate">{s.name}</span>
                <span className="text-[10px] uppercase text-slate-400">{s.language}</span>
              </label>
            ))}
          </div>
          <div className="mt-2 flex justify-between border-t border-slate-100 pt-2">
            <button onClick={() => setPicked([])} className="text-xs text-slate-500 hover:text-slate-800">
              Clear
            </button>
            <button
              onClick={() => {
                setOpen(false);
                onChange(picked);
              }}
              className="rounded bg-brand px-3 py-1 text-xs font-semibold text-white"
            >
              Apply
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** One-click filter row: "All" plus each option. */
function ChipRow({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  const chip = (on: boolean) =>
    `shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-sm transition ${on ? "bg-brand font-semibold text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`;
  return (
    // One swipeable line on phones, wrapping on wider screens.
    <div className="no-scrollbar -mx-3 flex items-center gap-1.5 overflow-x-auto px-3 pb-0.5 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
      <span className="shrink-0 pr-1 text-xs font-semibold uppercase tracking-wide text-slate-400 sm:w-20 sm:pr-0">{label}</span>
      <button onClick={() => onChange("")} className={chip(!value)}>All</button>
      {options.map((o) => (
        <button key={o.value} onClick={() => onChange(o.value)} className={chip(value === o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
