"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toQuery, type Filters } from "@/lib/filters";

interface NgramRow {
  ngram: string;
  articles: number;
  sources: number;
}

const control = "rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm outline-none focus:border-brand";

/**
 * Frequent phrases in the articles matching the current filters. Choose the
 * text (English headline — translations included — original headline, or
 * summary), phrase length, and whether to count articles or outlets.
 *
 * The phrase list and the article list are separate:
 *  - click a phrase: the articles below show only that phrase; the phrase
 *    list stays put, so you can click through phrases one after another
 *    (click it again, or ✕, to see all articles again);
 *  - double-click a phrase: go inside it — the phrase list is recomputed over
 *    just those articles. The breadcrumb steps back out.
 */
export function NgramPanel({ filters, storyId, watchlistId, defaultOpen = false }: { filters: Filters; storyId?: number; watchlistId?: number; defaultOpen?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(defaultOpen || !!filters.ng || filters.drill.length > 0);
  const [field, setField] = useState<"en" | "original" | "summary">(filters.ngin === "all" ? "summary" : "en");
  const [n, setN] = useState(2);
  const [stop, setStop] = useState(true);
  const [by, setBy] = useState<"articles" | "sources">("sources");
  const [min, setMin] = useState(2);
  const [data, setData] = useState<{ articles: number; ngrams: NgramRow[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState("");
  const [navigating, startNav] = useTransition();
  // The phrase just clicked, shown as selected before the new articles arrive.
  const [picked, setPicked] = useState<string | null>(null);
  useEffect(() => setPicked(null), [filters.ng]);
  const selected = picked ?? filters.ng;

  // The picked phrase doesn't change the phrase list, so leave it out here.
  const filterQs = toQuery(filters, { page: 1, ng: "" });

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams(filterQs.replace(/^\?/, ""));
    params.set("field", field);
    params.set("n", String(n));
    params.set("stop", stop ? "1" : "0");
    params.set("by", by);
    params.set("min", String(min));
    if (storyId) params.set("story", String(storyId));
    if (watchlistId) params.set("watchlist", String(watchlistId));
    fetch(`/api/ngrams?${params}`)
      .then((r) => r.json())
      .then((d) => !cancelled && setData(d))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [open, filterQs, field, n, stop, by, min, storyId, watchlistId]);

  const rows = (data?.ngrams || []).filter((r) => r.ngram.includes(text.toLowerCase()));
  const max = Math.max(1, ...rows.map((r) => (by === "sources" ? r.sources : r.articles)));
  const ngin = field === "summary" ? "all" : "title";

  function go(overrides: Partial<Filters>) {
    startNav(() => router.push(`${pathname}${toQuery(filters, { page: 1, ngin, ...overrides })}`, { scroll: false }));
  }
  // Acts on the first click straight away; the second click of a
  // double-click (detail 2) is left to onDoubleClick.
  function click(e: React.MouseEvent, phrase: string) {
    if (e.detail > 1) return;
    const next = selected === phrase ? "" : phrase;
    setPicked(next);
    go({ ng: next });
  }
  function dive(phrase: string) {
    setPicked("");
    go({ drill: [...filters.drill, phrase], ng: "" });
  }

  return (
    <div className="mb-4 rounded-xl border border-slate-200 bg-white">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between px-4 py-2.5 text-left">
        <span className="text-sm font-semibold text-ink">
          Phrases (n-grams){" "}
          <span className="font-normal text-slate-400">— frequent 1–3 word phrases in the articles below</span>
        </span>
        <span className="text-slate-400">{open ? "▴" : "▾"}</span>
      </button>
      {open ? (
        <div className="border-t border-slate-100 px-4 py-3">
          <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
            <select value={field} onChange={(e) => setField(e.target.value as typeof field)} className={control}>
              <option value="en">English headline (incl. translations)</option>
              <option value="original">Original headline</option>
              <option value="summary">Summary</option>
            </select>
            <div className="inline-flex overflow-hidden rounded-lg border border-slate-300">
              {[1, 2, 3].map((k) => (
                <button key={k} onClick={() => setN(k)} className={`px-2.5 py-1 ${n === k ? "bg-brand text-white" : "bg-white text-slate-600"}`}>
                  {k}-word
                </button>
              ))}
            </div>
            <select value={by} onChange={(e) => setBy(e.target.value as typeof by)} className={control}>
              <option value="sources">Count outlets</option>
              <option value="articles">Count articles</option>
            </select>
            <label className="flex items-center gap-1 text-slate-500">
              min
              <input type="number" min={1} value={min} onChange={(e) => setMin(Math.max(1, Number(e.target.value) || 1))} className={`${control} w-16`} />
            </label>
            <label className="flex items-center gap-1.5 text-slate-600">
              <input type="checkbox" checked={stop} onChange={(e) => setStop(e.target.checked)} />
              Skip filler words
            </label>
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Find phrase…" className={`${control} w-40`} />
            <span className="ml-auto text-xs text-slate-400">
              {navigating ? "Loading articles…" : loading ? "Counting…" : data ? `${data.articles.toLocaleString()} articles analysed` : ""}
            </span>
          </div>
          {filters.drill.length || filters.ng ? (
            <div className="mb-2 flex flex-wrap items-center gap-1 rounded-lg bg-slate-50 px-2 py-1.5 text-sm">
              <button onClick={() => go({ drill: [], ng: "" })} className="text-brand hover:underline">
                All phrases
              </button>
              {filters.drill.map((d, i) => (
                <span key={i} className="flex items-center gap-1">
                  <span className="text-slate-400">›</span>
                  <button onClick={() => go({ drill: filters.drill.slice(0, i + 1), ng: "" })} className="font-medium text-brand hover:underline">
                    {d}
                  </button>
                </span>
              ))}
              {filters.ng ? (
                <span className="ml-auto flex items-center gap-2 text-slate-600">
                  Articles below: only <b className="text-ink">“{filters.ng}”</b>
                  <button onClick={() => go({ ng: "" })} className="rounded border border-slate-300 bg-white px-1.5 text-xs hover:border-brand" title="Show all articles again">
                    ✕ show all
                  </button>
                </span>
              ) : null}
            </div>
          ) : null}
          <p className="mb-2 text-xs text-slate-400">Click a phrase to see its articles below · double-click to look inside it</p>
          {rows.length === 0 && !loading ? (
            <p className="py-4 text-center text-sm text-slate-400">No phrases meet these settings.</p>
          ) : (
            <div className="grid max-h-96 gap-x-6 gap-y-0.5 overflow-y-auto sm:grid-cols-2">
              {rows.map((r) => {
                const v = by === "sources" ? r.sources : r.articles;
                return (
                  <button
                    key={r.ngram}
                    onClick={(e) => click(e, r.ngram)}
                    onDoubleClick={() => dive(r.ngram)}
                    className={`group flex select-none items-center gap-2 rounded px-1 py-0.5 text-left ${selected === r.ngram ? "bg-brand/10 ring-1 ring-brand" : "hover:bg-slate-50"}`}
                  >
                    <span className={`w-44 shrink-0 truncate text-sm group-hover:text-brand ${selected === r.ngram ? "font-semibold text-brand" : "text-slate-700"}`}>{r.ngram}</span>
                    <span className="h-2 flex-1 rounded bg-slate-100">
                      <span className="block h-2 rounded bg-brand/70" style={{ width: `${(v / max) * 100}%` }} />
                    </span>
                    <span className="w-24 shrink-0 text-right text-xs text-slate-500">
                      {r.sources} outlets · {r.articles}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
