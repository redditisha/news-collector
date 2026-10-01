import type { SearchMode, Fields } from "@/lib/match";

/**
 * The filters every section shares, read from / written to the URL so views
 * are linkable and survive reloads.
 */
export interface Filters {
  q: string;
  mode: SearchMode;
  fields: Fields;          // search in headlines only, or headlines + summaries
  also: string[];          // extra terms picked from "similar terms"
  range: string;           // "", "6h", "24h", "7d", "30d" — relative presets
  from: string;            // YYYY-MM-DD (IST), inclusive
  to: string;              // YYYY-MM-DD (IST), inclusive
  group: string;           // category group
  cat: string;             // category (topic) slug
  src: string[];           // source ids
  lang: string;            // en | kn | hi
  sort: "published" | "fetched";
  order: "desc" | "asc";   // newest first (default) or oldest first
  page: number;
  // Phrase panel (n-grams). `drill` narrows the phrase list itself (double-click
  // a phrase to go inside it); `ng` only narrows the articles shown (single
  // click), leaving the phrase list as it was.
  drill: string[];
  ng: string;
  ngin: "title" | "all";   // where drill/ng phrases must appear: headlines, or also summaries
}

export const PAGE_SIZE = 50;

export const RANGES: { value: string; label: string; hours: number }[] = [
  { value: "6h", label: "6 hours", hours: 6 },
  { value: "24h", label: "24 hours", hours: 24 },
  { value: "7d", label: "7 days", hours: 24 * 7 },
  { value: "30d", label: "30 days", hours: 24 * 30 },
];

type Params = Record<string, string | string[] | undefined>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || "";
const list = (v: string | string[] | undefined) =>
  one(v).split(",").map((s) => s.trim()).filter(Boolean);
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

export function parseFilters(sp: Params, defaults: Partial<Filters> = {}): Filters {
  const mode = one(sp.mode);
  const sort = one(sp.sort);
  return {
    q: one(sp.q).trim(),
    mode: mode === "any" || mode === "phrase" ? mode : "all",
    fields: one(sp.fields) === "title" ? "title" : "all",
    also: list(sp.also),
    // "all" = explicitly no range (overrides a page default like Stories' 24h)
    range: RANGES.some((r) => r.value === one(sp.range)) ? one(sp.range) : one(sp.range) === "all" ? "all" : defaults.range ?? "",
    from: isDate(one(sp.from)) ? one(sp.from) : defaults.from ?? "",
    to: isDate(one(sp.to)) ? one(sp.to) : defaults.to ?? "",
    group: one(sp.group),
    cat: one(sp.cat),
    src: list(sp.src),
    lang: one(sp.lang),
    sort: sort === "fetched" ? "fetched" : "published",
    order: one(sp.order) === "asc" ? "asc" : defaults.order ?? "desc",
    page: Math.max(1, parseInt(one(sp.page)) || 1),
    drill: one(sp.drill).split("|").map((s) => s.trim()).filter(Boolean),
    ng: one(sp.ng).trim(),
    ngin: one(sp.ngin) === "all" ? "all" : "title",
  };
}

/** Filters → query string (only non-default values). */
export function toQuery(f: Partial<Filters>, overrides: Partial<Filters> = {}): string {
  const m = { ...f, ...overrides };
  const p = new URLSearchParams();
  if (m.q) p.set("q", m.q);
  if (m.mode && m.mode !== "all") p.set("mode", m.mode);
  if (m.fields && m.fields !== "all") p.set("fields", m.fields);
  if (m.also?.length) p.set("also", m.also.join(","));
  if (m.range) p.set("range", m.range);
  if (m.from) p.set("from", m.from);
  if (m.to) p.set("to", m.to);
  if (m.group) p.set("group", m.group);
  if (m.cat) p.set("cat", m.cat);
  if (m.src?.length) p.set("src", m.src.join(","));
  if (m.lang) p.set("lang", m.lang);
  if (m.sort && m.sort !== "published") p.set("sort", m.sort);
  if (m.order === "asc") p.set("order", "asc");
  if (m.page && m.page > 1) p.set("page", String(m.page));
  if (m.drill?.length) p.set("drill", m.drill.join("|"));
  if (m.ng) p.set("ng", m.ng);
  if ((m.drill?.length || m.ng) && m.ngin === "all") p.set("ngin", "all");
  const s = p.toString();
  return s ? `?${s}` : "";
}

/** IST calendar day → UTC ISO instant at its start. */
export function istDayStart(day: string): string {
  return new Date(`${day}T00:00:00+05:30`).toISOString();
}

/** Today's date in IST (YYYY-MM-DD). */
export function istToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00+05:30`);
  d.setUTCDate(d.getUTCDate() + n);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(d);
}

/** [since, until) as UTC ISO strings from range/from/to; either may be null. */
export function timeWindow(f: Pick<Filters, "range" | "from" | "to">): { since: string | null; until: string | null } {
  if (f.from || f.to) {
    return {
      since: f.from ? istDayStart(f.from) : null,
      until: f.to ? istDayStart(addDays(f.to, 1)) : null,
    };
  }
  const r = RANGES.find((x) => x.value === f.range); // "all" / "" match nothing: no limit
  return { since: r ? new Date(Date.now() - r.hours * 3600_000).toISOString() : null, until: null };
}

export function hasAnyFilter(f: Filters): boolean {
  return !!(f.q || f.also.length || (f.range && f.range !== "all") || f.from || f.to || f.group || f.cat || f.src.length || f.lang || f.drill.length || f.ng);
}
