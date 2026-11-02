"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CALENDAR_CATEGORIES, STATE_NAMES, categoryOf, eventEnd, type CalEvent } from "@/lib/calendarMeta";

/**
 * Google-Calendar-style view of the news calendar: a month grid (multi-day
 * events as bars across their days) or an agenda list, category tick boxes
 * (all on by default, remembered on this device), a state filter, and a
 * details panel for each event. Read-only; events are changed via the MCP.
 */

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const STORE_KEY = "calendar:hidden-categories";

const toDate = (iso: string) => new Date(`${iso}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (s: string, n: number) => {
  const d = toDate(s);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
};
const monthLabel = (m: string) => new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }).format(toDate(`${m}-01`));
const shiftMonth = (m: string, n: number) => {
  const d = toDate(`${m}-01`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return iso(d).slice(0, 7);
};
const fmt = (s: string, opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short", year: "numeric" }) =>
  new Intl.DateTimeFormat("en-IN", { ...opts, timeZone: "UTC" }).format(toDate(s));
const rangeText = (e: CalEvent) =>
  e.end && e.end !== e.start ? `${fmt(e.start, { weekday: "short", day: "numeric", month: "short" })} – ${fmt(e.end)}` : fmt(e.start);

export function CalendarView({ events, today, initialMonth }: { events: CalEvent[]; today: string; initialMonth: string }) {
  const [month, setMonth] = useState(initialMonth);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [state, setState] = useState("");
  const [view, setView] = useState<"month" | "agenda">("month");
  const [open, setOpen] = useState<CalEvent | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY) || "[]");
      if (Array.isArray(saved)) setHidden(new Set(saved));
    } catch {}
    if (window.innerWidth < 640) setView("agenda");
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify([...hidden]));
    } catch {}
  }, [hidden]);
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("m", month);
    window.history.replaceState(null, "", url);
  }, [month]);

  const visible = useMemo(
    () => events.filter((e) => !hidden.has(e.category) && (!state || !e.states || e.states.split(",").includes(state))),
    [events, hidden, state]
  );
  const usedStates = useMemo(
    () => [...new Set(events.flatMap((e) => (e.states ? e.states.split(",") : [])))].sort((a, b) => (STATE_NAMES[a] ?? a).localeCompare(STATE_NAMES[b] ?? b)),
    [events]
  );
  const counts = useMemo(() => {
    const first = `${month}-01`;
    const last = addDays(`${shiftMonth(month, 1)}-01`, -1);
    const c: Record<string, number> = {};
    for (const e of events) if (eventEnd(e) >= first && e.start <= last) c[e.category] = (c[e.category] ?? 0) + 1;
    return c;
  }, [events, month]);

  const toggle = (key: string) =>
    setHidden((h) => {
      const n = new Set(h);
      n.has(key) ? n.delete(key) : n.add(key);
      return n;
    });

  const filters = (
    <div className="space-y-4">
      <div>
        <div className="mb-1.5 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-400">
          Calendars
          <span className="flex gap-2 normal-case tracking-normal">
            <button onClick={() => setHidden(new Set())} className="text-brand hover:underline">All</button>
            <button onClick={() => setHidden(new Set(CALENDAR_CATEGORIES.map((c) => c.key)))} className="text-brand hover:underline">None</button>
          </span>
        </div>
        <ul className="space-y-0.5">
          {CALENDAR_CATEGORIES.map((c) => (
            <li key={c.key}>
              <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={!hidden.has(c.key)}
                  onChange={() => toggle(c.key)}
                  className="h-4 w-4 rounded"
                  style={{ accentColor: c.color }}
                />
                <span className="flex-1 text-slate-700">{c.label}</span>
                {counts[c.key] ? <span className="text-xs text-slate-400">{counts[c.key]}</span> : null}
              </label>
            </li>
          ))}
        </ul>
      </div>
      <label className="block">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">State</span>
        <select value={state} onChange={(e) => setState(e.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm">
          <option value="">All of India</option>
          {usedStates.map((s) => (
            <option key={s} value={s}>
              {STATE_NAMES[s] ?? s} + national
            </option>
          ))}
        </select>
      </label>
      <p className="text-xs text-slate-400">Dashed = tentative (expected, not yet announced).</p>
    </div>
  );

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <aside className="hidden w-56 shrink-0 lg:block">{filters}</aside>

      <div className="min-w-0 flex-1">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <button onClick={() => setMonth(today.slice(0, 7))} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">Today</button>
          <button onClick={() => setMonth(shiftMonth(month, -1))} className="rounded-lg px-2 py-1.5 text-lg leading-none text-slate-600 hover:bg-slate-100" aria-label="Previous month">‹</button>
          <button onClick={() => setMonth(shiftMonth(month, 1))} className="rounded-lg px-2 py-1.5 text-lg leading-none text-slate-600 hover:bg-slate-100" aria-label="Next month">›</button>
          <h2 className="text-lg font-semibold text-ink">{monthLabel(month)}</h2>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={() => setFiltersOpen((o) => !o)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm lg:hidden">
              Filters{hidden.size || state ? " •" : ""}
            </button>
            <div className="inline-flex overflow-hidden rounded-lg border border-slate-300 text-sm">
              {(["month", "agenda"] as const).map((v) => (
                <button key={v} onClick={() => setView(v)} className={`px-3 py-1.5 capitalize ${view === v ? "bg-brand text-white" : "bg-white text-slate-600"}`}>
                  {v}
                </button>
              ))}
            </div>
          </div>
        </div>
        {filtersOpen ? <div className="mb-3 rounded-xl border border-slate-200 bg-white p-3 lg:hidden">{filters}</div> : null}

        {view === "month" ? (
          <MonthGrid month={month} today={today} events={visible} onOpen={setOpen} onDay={setDay} />
        ) : (
          <Agenda month={month} today={today} events={visible} onOpen={setOpen} />
        )}
      </div>

      {day ? (
        <Modal onClose={() => setDay(null)} title={fmt(day, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}>
          <ul className="space-y-1">
            {visible
              .filter((e) => e.start <= day && eventEnd(e) >= day)
              .map((e) => (
                <li key={e.id}>
                  <button onClick={() => (setDay(null), setOpen(e))} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-slate-50">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: categoryOf(e.category).color }} />
                    <span className="flex-1">{e.title}</span>
                  </button>
                </li>
              ))}
          </ul>
        </Modal>
      ) : null}
      {open ? <EventDetails event={open} today={today} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}

function EventChip({ e, onOpen, compact = false }: { e: CalEvent; onOpen: (e: CalEvent) => void; compact?: boolean }) {
  const c = categoryOf(e.category);
  const tentative = e.status === "tentative";
  return (
    <button
      onClick={() => onOpen(e)}
      title={`${e.title}${tentative ? " (tentative)" : ""}`}
      className={`block w-full truncate rounded px-1.5 text-left font-medium ${compact ? "py-0 text-[10px] sm:text-[11px]" : "py-0.5 text-xs"} ${tentative ? "border border-dashed" : ""}`}
      style={tentative ? { borderColor: c.color, color: c.color, background: `${c.color}12` } : { background: c.color, color: "white" }}
    >
      {e.title}
    </button>
  );
}

function MonthGrid({ month, today, events, onOpen, onDay }: { month: string; today: string; events: CalEvent[]; onOpen: (e: CalEvent) => void; onDay: (d: string) => void }) {
  const first = `${month}-01`;
  const gridStart = addDays(first, -toDate(first).getUTCDay());
  const lastOfMonth = addDays(`${shiftMonth(month, 1)}-01`, -1);
  const weeks: string[][] = [];
  for (let w = 0; w < 6; w++) {
    const days = Array.from({ length: 7 }, (_, i) => addDays(gridStart, w * 7 + i));
    if (w > 3 && days[0] > lastOfMonth) break;
    weeks.push(days);
  }
  const MAX_LANES = 4;

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {WEEKDAYS.map((d) => (
          <div key={d} className="py-1.5">{d}</div>
        ))}
      </div>
      {weeks.map((days) => {
        const wStart = days[0];
        const wEnd = days[6];
        // Segments of the events overlapping this week, longest first, packed into lanes.
        const segs = events
          .filter((e) => e.start <= wEnd && eventEnd(e) >= wStart)
          .map((e) => {
            const s = e.start < wStart ? wStart : e.start;
            const en = eventEnd(e) > wEnd ? wEnd : eventEnd(e);
            const total = (toDate(eventEnd(e)).getTime() - toDate(e.start).getTime()) / 86_400_000 + 1;
            // Long background windows (a results season, an election window) go
            // after day-specific events so they don't crowd them out.
            const background = total > 10 ? 1 : 0;
            return { e, col: days.indexOf(s), span: days.indexOf(en) - days.indexOf(s) + 1, background };
          })
          .sort((a, b) => a.background - b.background || a.col - b.col || b.span - a.span);
        const lanes: number[][] = [];
        const placed = segs.map((sg) => {
          let lane = lanes.findIndex((occ) => occ.every((c) => c < sg.col || c >= sg.col + sg.span));
          if (lane < 0) lane = lanes.push([]) - 1;
          for (let c = sg.col; c < sg.col + sg.span; c++) lanes[lane].push(c);
          return { ...sg, lane };
        });
        const more = days.map((_, i) => placed.filter((p) => p.lane >= MAX_LANES && p.col <= i && i < p.col + p.span).length);
        return (
          <div key={wStart} className="relative grid min-h-[96px] grid-cols-7 border-b border-slate-100 last:border-b-0 sm:min-h-[124px]" style={{ gridTemplateRows: `auto repeat(${MAX_LANES}, auto) 1fr` }}>
            {days.map((d, i) => (
              <button
                key={d}
                onClick={() => onDay(d)}
                className={`row-span-full border-r border-slate-100 text-left last:border-r-0 hover:bg-slate-50 ${d.slice(0, 7) !== month ? "bg-slate-50/60" : ""}`}
                style={{ gridColumn: i + 1, gridRow: "1 / -1" }}
                aria-label={fmt(d)}
              />
            ))}
            {days.map((d, i) => (
              <div key={`n${d}`} className="pointer-events-none px-1.5 pt-1 text-right text-xs" style={{ gridColumn: i + 1, gridRow: 1 }}>
                <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full ${d === today ? "bg-brand font-semibold text-white" : d.slice(0, 7) === month ? "text-slate-700" : "text-slate-300"}`}>
                  {Number(d.slice(8))}
                </span>
              </div>
            ))}
            {placed
              .filter((p) => p.lane < MAX_LANES)
              .map((p) => (
                <div key={p.e.id + wStart} className="relative z-10 px-0.5 pb-0.5" style={{ gridColumn: `${p.col + 1} / span ${p.span}`, gridRow: p.lane + 2 }}>
                  <EventChip e={p.e} onOpen={onOpen} compact />
                </div>
              ))}
            {more.map((n, i) =>
              n ? (
                <button key={`m${i}`} onClick={() => onDay(days[i])} className="relative z-10 self-start px-1.5 text-left text-[10px] font-medium text-slate-500 hover:text-brand sm:text-[11px]" style={{ gridColumn: i + 1, gridRow: MAX_LANES + 2 }}>
                  +{n} more
                </button>
              ) : null
            )}
          </div>
        );
      })}
    </div>
  );
}

function Agenda({ month, today, events, onOpen }: { month: string; today: string; events: CalEvent[]; onOpen: (e: CalEvent) => void }) {
  const first = `${month}-01`;
  const last = addDays(`${shiftMonth(month, 1)}-01`, -1);
  // An event is listed on its start day, or on the 1st if it began last month.
  const byDay = new Map<string, CalEvent[]>();
  for (const e of events) {
    if (eventEnd(e) < first || e.start > last) continue;
    const d = e.start < first ? first : e.start;
    byDay.set(d, [...(byDay.get(d) ?? []), e]);
  }
  const days = [...byDay.keys()].sort();
  if (!days.length) return <p className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">Nothing in this month for the selected calendars.</p>;
  return (
    <div className="space-y-3">
      {days.map((d) => (
        <div key={d} className="flex gap-3 rounded-xl border border-slate-200 bg-white p-3">
          <div className={`w-12 shrink-0 text-center ${d === today ? "text-brand" : "text-slate-600"}`}>
            <div className="text-[11px] font-semibold uppercase">{fmt(d, { weekday: "short" })}</div>
            <div className="text-2xl font-bold leading-tight">{Number(d.slice(8))}</div>
          </div>
          <ul className="min-w-0 flex-1 space-y-1.5">
            {byDay.get(d)!.map((e) => (
              <li key={e.id}>
                <button onClick={() => onOpen(e)} className="flex w-full items-start gap-2 text-left">
                  <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${e.status === "tentative" ? "border-2 bg-white" : ""}`} style={e.status === "tentative" ? { borderColor: categoryOf(e.category).color } : { background: categoryOf(e.category).color }} />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-ink">{e.title}</span>
                    <span className="block text-xs text-slate-500">
                      {categoryOf(e.category).label}
                      {e.end && e.end !== e.start ? ` · ${rangeText(e)}` : ""}
                      {e.states ? ` · ${e.states.split(",").map((s) => STATE_NAMES[s] ?? s).join(", ")}` : ""}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function EventDetails({ event: e, today, onClose }: { event: CalEvent; today: string; onClose: () => void }) {
  const c = categoryOf(e.category);
  // Related coverage: a few days around the event, never past today.
  const from = addDays(e.start, -3);
  let to = addDays(eventEnd(e), 3);
  if (to > today) to = today;
  const newsHref = from <= today ? `/browse?q=${encodeURIComponent(e.keywords || e.title)}&mode=any&from=${from}&to=${to}` : null;
  return (
    <Modal onClose={onClose} title={e.title} color={c.color}>
      <dl className="space-y-2 text-sm">
        <Row label="When">
          {rangeText(e)}
          {e.time ? ` · ${e.time} IST` : ""}
          {e.status === "tentative" ? <span className="ml-2 rounded border border-dashed border-amber-400 px-1.5 text-xs text-amber-700">tentative</span> : null}
        </Row>
        <Row label="Calendar">
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: c.color }} />{c.label}</span>
        </Row>
        {e.states ? <Row label="States">{e.states.split(",").map((s) => STATE_NAMES[s] ?? s).join(", ")}</Row> : null}
        {e.location ? <Row label="Where">{e.location}</Row> : null}
        {e.description ? <Row label="About">{e.description}</Row> : null}
        {e.source ? <Row label="Source">{e.source}</Row> : null}
      </dl>
      <div className="mt-4 flex flex-wrap gap-2">
        {newsHref ? (
          <Link href={newsHref} className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700">Related news</Link>
        ) : (
          <span className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm text-slate-500">Coming up — news will appear closer to the date</span>
        )}
        {e.link ? (
          <a href={e.link} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">More info ↗</a>
        ) : null}
      </div>
    </Modal>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <dt className="w-20 shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="min-w-0 flex-1 text-slate-700">{children}</dd>
    </div>
  );
}

function Modal({ title, color, onClose, children }: { title: string; color?: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const k = (ev: KeyboardEvent) => ev.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <button className="absolute inset-0 bg-slate-900/40" onClick={onClose} aria-label="Close" />
      <div className="relative max-h-[85vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:max-w-lg sm:rounded-2xl">
        <div className="mb-3 flex items-start gap-3">
          {color ? <span className="mt-1.5 h-3 w-3 shrink-0 rounded" style={{ background: color }} /> : null}
          <h3 className="flex-1 text-lg font-semibold leading-snug text-ink">{title}</h3>
          <button onClick={onClose} className="rounded px-2 text-xl leading-none text-slate-400 hover:text-slate-700" aria-label="Close">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}
