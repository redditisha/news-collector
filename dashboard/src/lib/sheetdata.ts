import fs from "fs";
import { GoogleAuth } from "google-auth-library";
import { db } from "@/lib/db";
import { addDays, istToday, timeWindow, type Filters } from "@/lib/filters";
import { HOSTED, HOSTED_MAX_DAYS } from "@/lib/mode";

/**
 * Hosted mode's data layer: fills the in-memory database (same schema as the
 * PC's archive) from the Google Sheet, so every page and query works as is.
 *
 *   day tabs (YYYY-MM-DD)  articles; loaded on demand for the dates a page
 *                          shows, at most HOSTED_MAX_DAYS at a time
 *   _sources, _health      sources and their feed health
 *   _runs                  collector run log
 *   _stories               stories (2+ outlets) with member article ids
 *   _watchlists            watchlist terms and hand-removed articles
 *   _pc_status             when the PC last published, its backlog
 *
 * Loaded data is cached in this server instance: today's and yesterday's
 * tabs for a few minutes (still growing), older ones longer (only their
 * translations change). Everything is a no-op in local mode.
 */

const API = "https://sheets.googleapis.com/v4/spreadsheets";
const META_TTL_MS = 2 * 60_000;
const RECENT_TAB_TTL_MS = 2 * 60_000;
const OLD_TAB_TTL_MS = 15 * 60_000;
const MAX_CACHED_TABS = 10;
const TABS_PER_CALL = 3;
const DATE_TAB = /^\d{4}-\d{2}-\d{2}$/;

const ARTICLE_COLUMNS = [
  "id", "published_at", "fetched_at", "source_id", "source_name", "language",
  "title", "url", "description", "title_en", "image_url", "guid",
  "category_group", "category", "topic",
];

type TabInfo = { sheetId: number; rowCount: number };
interface Cache {
  tabs?: { at: number; map: Map<string, TabInfo> };
  metaAt?: number;
  loaded: Map<string, { at: number; used: number }>;
  queue: Promise<unknown>;
  client?: Promise<{ getAccessToken(): Promise<{ token?: string | null }> }>;
}
const g = globalThis as unknown as { __sheetCache?: Cache };
const cache = (): Cache => (g.__sheetCache ??= { loaded: new Map(), queue: Promise.resolve() });

// ---------------------------------------------------------------------------
// Sheets API
// ---------------------------------------------------------------------------

function credentials() {
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) return JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  const file = process.env.GOOGLE_SERVICE_ACCOUNT_FILE;
  if (file) return JSON.parse(fs.readFileSync(file, "utf8"));
  throw new Error("Set GOOGLE_SERVICE_ACCOUNT_JSON (or GOOGLE_SERVICE_ACCOUNT_FILE) to read the sheet.");
}

async function call(method: string, path: string, body?: unknown, attempt = 0): Promise<any> {
  const c = cache();
  c.client ??= new GoogleAuth({ credentials: credentials(), scopes: ["https://www.googleapis.com/auth/spreadsheets"] }).getClient() as any;
  const { token } = await (await c.client!).getAccessToken();
  const res = await fetch(`${API}/${process.env.SHEET_ID}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  if ((res.status === 429 || res.status >= 500) && attempt < 3) {
    await new Promise((r) => setTimeout(r, 1500 * 2 ** attempt));
    return call(method, path, body, attempt + 1);
  }
  if (!res.ok) throw new Error(`Sheets API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

const range = (tab: string, a1: string) => `'${tab.replace(/'/g, "''")}'!${a1}`;

async function read(ranges: string[]): Promise<string[][][]> {
  if (!ranges.length) return [];
  const qs = ranges.map((r) => `ranges=${encodeURIComponent(r)}`).join("&");
  const d = await call("GET", `/values:batchGet?${qs}&majorDimension=ROWS`);
  return (d.valueRanges || []).map((v: any) => v.values || []);
}

async function tabs(): Promise<Map<string, TabInfo>> {
  const c = cache();
  if (c.tabs && Date.now() - c.tabs.at < META_TTL_MS) return c.tabs.map;
  const d = await call("GET", "?fields=sheets.properties(sheetId,title,gridProperties.rowCount)");
  const map = new Map<string, TabInfo>(
    (d.sheets || []).map((s: any) => [s.properties.title, { sheetId: s.properties.sheetId, rowCount: s.properties.gridProperties?.rowCount ?? 0 }])
  );
  c.tabs = { at: Date.now(), map };
  return map;
}

/** Day tabs in the sheet, newest first, with their article counts. */
export async function dayTabs(): Promise<{ day: string; rows: number }[]> {
  return [...(await tabs())]
    .filter(([t]) => DATE_TAB.test(t))
    .map(([day, info]) => ({ day, rows: Math.max(info.rowCount - 1, 0) }))
    .sort((a, b) => b.day.localeCompare(a.day));
}

// ---------------------------------------------------------------------------
// Loading into the in-memory database
// ---------------------------------------------------------------------------

const cell = (r: string[], i: number) => (r[i] ?? "").toString();
const orNull = (s: string) => (s === "" ? null : s);
const num = (s: string) => (/^-?\d+$/.test(s) ? Number(s) : null);

async function loadMeta(): Promise<void> {
  const c = cache();
  if (c.metaAt && Date.now() - c.metaAt < META_TTL_MS) return;
  const t = await tabs();
  const want: [string, string][] = [
    ["_sources", "A2:L"], ["_health", "A2:H"], ["_runs", "A2:O"],
    ["_stories", "A2:G"], ["_watchlists", "A2:F"], ["_pc_status", "A2:B"],
    ["_translate_runs", "A2:L"],
  ];
  const present = want.filter(([tab]) => t.has(tab));
  const values = await read(present.map(([tab, a1]) => range(tab, a1)));
  const got = new Map(present.map(([tab], i) => [tab, values[i]]));
  const d = db();
  d.transaction(() => {
    const sources = got.get("_sources") ?? [];
    if (sources.length) {
      d.prepare("delete from sources").run();
      const ins = d.prepare(
        `insert or replace into sources (id, name, rss_url, language, country, region, category_group,
           primary_category, secondary_category, source_type, priority, active)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const r of sources) {
        if (!cell(r, 0)) continue;
        ins.run(cell(r, 0), cell(r, 1), cell(r, 2), cell(r, 3) || "en", orNull(cell(r, 4)), orNull(cell(r, 5)),
          orNull(cell(r, 6)), orNull(cell(r, 7)), orNull(cell(r, 8)), orNull(cell(r, 9)), num(cell(r, 10)) ?? 2,
          cell(r, 11) === "0" || cell(r, 11).toLowerCase() === "false" ? 0 : 1);
      }
    }
    const health = d.prepare(
      "update sources set last_checked_at = ?, last_success_at = ?, last_failure_at = ?, last_error = ? where id = ?"
    );
    for (const r of got.get("_health") ?? []) {
      health.run(orNull(cell(r, 1)), orNull(cell(r, 5)), orNull(cell(r, 6)), orNull(cell(r, 7)), cell(r, 0));
    }

    const runs = got.get("_runs") ?? [];
    const insRun = d.prepare(
      `insert or replace into collector_log (run_id, started_at, finished_at, trigger, status, duration_ms, sources,
         failed, new_articles, duplicates, skipped_old, tabs, details, url, error)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const r of runs) {
      if (!cell(r, 0) || !cell(r, 1)) continue;
      insRun.run(cell(r, 0), cell(r, 1), orNull(cell(r, 2)), orNull(cell(r, 3)), orNull(cell(r, 4)), num(cell(r, 5)),
        num(cell(r, 6)), num(cell(r, 7)), num(cell(r, 8)), num(cell(r, 9)), num(cell(r, 10)), orNull(cell(r, 11)),
        orNull(cell(r, 12)), orNull(cell(r, 13)), orNull(cell(r, 14)));
    }

    if (got.has("_stories")) {
      d.prepare("delete from stories").run();
      d.prepare("delete from article_story").run();
      const insStory = d.prepare(
        "insert into stories (id, title, first_seen, last_seen, article_count, source_count) values (?, ?, ?, ?, ?, ?)"
      );
      const insMember = d.prepare("insert or ignore into article_story (article_id, story_id) values (?, ?)");
      for (const r of got.get("_stories")!) {
        const id = num(cell(r, 0));
        if (id === null) continue;
        insStory.run(id, cell(r, 1), cell(r, 2), cell(r, 3), num(cell(r, 4)) ?? 0, num(cell(r, 5)) ?? 0);
        for (const a of cell(r, 6).split(",")) if (a) insMember.run(a, id);
      }
    }

    if (got.has("_watchlists")) {
      d.prepare("delete from watchlists").run();
      d.prepare("delete from watchlist_removed").run();
      const insW = d.prepare("insert into watchlists (id, name, terms, fields, sort) values (?, ?, ?, ?, ?)");
      const insR = d.prepare("insert or ignore into watchlist_removed (watchlist_id, article_id) values (?, ?)");
      for (const r of got.get("_watchlists")!) {
        const id = num(cell(r, 0));
        if (id === null) continue;
        insW.run(id, cell(r, 1), cell(r, 2), cell(r, 3) === "title" ? "title" : "all", num(cell(r, 4)) ?? 100);
        for (const a of cell(r, 5).split(",")) if (a) insR.run(id, a);
      }
    }

    const setState = d.prepare(
      "insert into app_state (key, value) values (?, ?) on conflict (key) do update set value = excluded.value"
    );
    for (const r of got.get("_pc_status") ?? []) if (cell(r, 0)) setState.run(`pc:${cell(r, 0)}`, cell(r, 1));
    // Cloud translator runs (same keys the PC keeps, see local/sync.py).
    const tr = (got.get("_translate_runs") ?? []).filter((r) => cell(r, 0));
    const latest = tr[tr.length - 1];
    if (latest) {
      setState.run("cloud:last_run_at", cell(latest, 2) || cell(latest, 1));
      setState.run("cloud:last_status", cell(latest, 3));
      setState.run("cloud:last_translated", cell(latest, 4));
      setState.run("cloud:last_pending", cell(latest, 6));
      setState.run("cloud:last_error", cell(latest, 11));
      setState.run("cloud:last_url", cell(latest, 10));
      const ok = tr.filter((r) => cell(r, 3) === "ok").pop();
      if (ok) setState.run("cloud:last_ok_at", cell(ok, 2) || cell(ok, 1));
    }
  })();
  c.metaAt = Date.now();
}

async function loadTabs(days: string[]): Promise<void> {
  const c = cache();
  const t = await tabs();
  const today = istToday();
  const recent = new Set([today, addDays(today, -1)]);
  const stale = days.filter((day) => {
    if (!t.has(day)) return false;
    const l = c.loaded.get(day);
    return !l || Date.now() - l.at > (recent.has(day) ? RECENT_TAB_TTL_MS : OLD_TAB_TTL_MS);
  });
  const d = db();
  const started = Date.now();
  // All stale tabs at once, in parallel; column L (guid, long and unused here) is skipped.
  const fetched = await Promise.all(
    stale.map(async (day) => {
      const [left, right] = await read([range(day, "A1:K"), range(day, "M1:O")]);
      return left.map((r, n) => {
        const row = [...r, ...Array(Math.max(0, 11 - r.length)).fill("")];
        return [...row.slice(0, 11), "", ...(right[n] ?? [])];
      });
    })
  );
  const fetchedMs = Date.now() - started;
  for (let i = 0; i < stale.length; i += TABS_PER_CALL) {
    const batch = stale.slice(i, i + TABS_PER_CALL);
    const values = fetched.slice(i, i + TABS_PER_CALL);
    d.transaction(() => {
      batch.forEach((day, k) => {
        const [header, ...rows] = values[k];
        const jIsTitleEn = (header?.[9] ?? "title_en") === "title_en"; // older tabs held author
        d.prepare("delete from articles where sheet_tab = ?").run(day);
        const ins = d.prepare(
          `insert or ignore into articles (id, source_id, title, url, guid, description, image_url, language,
             category_group, category, topic, published_at, fetched_at, synced_at, sheet_tab, title_en)
           values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );
        for (const r of rows) {
          const a = Object.fromEntries(ARTICLE_COLUMNS.map((col, j) => [col, cell(r, j)]));
          if (!a.id || !a.title || !a.url) continue;
          const lang = a.language || "en";
          const fetched = a.fetched_at || a.published_at || new Date().toISOString();
          ins.run(a.id, a.source_id, a.title, a.url, orNull(a.guid), orNull(a.description), orNull(a.image_url), lang,
            orNull(a.category_group), orNull(a.category), orNull(a.topic), orNull(a.published_at), fetched, fetched, day,
            jIsTitleEn && lang !== "en" ? orNull(a.title_en) : null);
        }
        // Search index for the tab's new rows (the per-row trigger is off in hosted mode).
        d.prepare(
          `insert into articles_fts (rowid, title, title_en, description)
           select rowid, title, title_en, description from articles where sheet_tab = ?`
        ).run(day);
      });
    })();
    for (const day of batch) c.loaded.set(day, { at: Date.now(), used: Date.now() });
  }
  if (stale.length) console.log(`[sheet] ${stale.join(", ")}: fetched in ${fetchedMs} ms, loaded in ${Date.now() - started} ms`);
  for (const day of days) {
    const l = c.loaded.get(day);
    if (l) l.used = Date.now();
  }
  // Keep memory bounded: drop the least recently used tabs.
  const extra = [...c.loaded].sort((a, b) => a[1].used - b[1].used).slice(0, Math.max(0, c.loaded.size - MAX_CACHED_TABS));
  for (const [day] of extra) {
    if (days.includes(day)) continue;
    d.prepare("delete from articles where sheet_tab = ?").run(day);
    c.loaded.delete(day);
  }
}

/** IST days from `since` to `until` (or today), newest first, at most HOSTED_MAX_DAYS. */
function daysBetween(since: string | null, until: string | null): string[] {
  const today = istToday();
  const toIst = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(iso));
  const last = until ? toIst(new Date(new Date(until).getTime() - 1).toISOString()) : today;
  const first = since ? toIst(since) : addDays(last, -(HOSTED_MAX_DAYS - 1));
  const out: string[] = [];
  for (let day = last < today ? last : today; day >= first && out.length < HOSTED_MAX_DAYS; day = addDays(day, -1)) out.push(day);
  return out;
}

/**
 * Make sure the in-memory database holds what a page needs: the sheet's
 * reference tabs, plus the day tabs covering the filters' dates, a story's
 * days, or explicit days. No-op in local mode.
 */
export async function ensureData(need: { filters?: Partial<Filters>; days?: string[]; storyId?: number } = {}): Promise<void> {
  if (!HOSTED) return;
  const c = cache();
  // One load at a time per instance: concurrent requests share the work.
  const job = c.queue.then(async () => {
    await loadMeta();
    const days = new Set(need.days ?? []);
    if (need.filters) {
      const { since, until } = timeWindow({ range: need.filters.range || "", from: need.filters.from || "", to: need.filters.to || "" });
      daysBetween(since, until).forEach((day) => days.add(day));
    }
    if (need.storyId !== undefined) {
      const s = db().prepare("select first_seen, last_seen from stories where id = ?").get(need.storyId) as
        | { first_seen: string; last_seen: string }
        | undefined;
      if (s) daysBetween(s.first_seen, new Date(new Date(s.last_seen).getTime() + 1).toISOString()).forEach((day) => days.add(day));
    }
    if (days.size) await loadTabs([...days].sort().reverse().slice(0, HOSTED_MAX_DAYS + 2));
  });
  c.queue = job.catch(() => undefined);
  return job;
}

/**
 * Hosted pages show at most HOSTED_MAX_DAYS at a time: "All time" / 30 days
 * become 7 days, an empty range becomes the page's default, and a custom
 * from–to range is cut to its last 7 days. Local mode: unchanged.
 */
export function hostedFilters<T extends Partial<Filters>>(f: T, fallbackRange = "24h"): T {
  if (!HOSTED) return f;
  if (f.from || f.to) {
    const to = f.to || istToday();
    const minFrom = addDays(to, -(HOSTED_MAX_DAYS - 1));
    return { ...f, to, from: !f.from || f.from < minFrom ? minFrom : f.from };
  }
  if (!f.range) return { ...f, range: fallbackRange };
  if (f.range === "all" || f.range === "30d") return { ...f, range: "7d" };
  return f;
}

// ---------------------------------------------------------------------------
// Admin: articles per day without loading whole tabs
// ---------------------------------------------------------------------------

export interface LightDay {
  day: string;
  total: number;
  sources: number;
  byLang: Record<string, number>;
  byGroup: Record<string, number>;
  topSources: { name: string; n: number }[];
}
const gStats = globalThis as unknown as { __dailyStats?: { at: number; n: number; data: LightDay[] } };

/** Per-day counts for the last n days from just the source and language columns (cached 30 min). */
export async function hostedDailyStats(n: number): Promise<LightDay[]> {
  if (gStats.__dailyStats && gStats.__dailyStats.n === n && Date.now() - gStats.__dailyStats.at < 30 * 60_000) {
    return gStats.__dailyStats.data;
  }
  await ensureData();
  const t = await tabs();
  const today = istToday();
  const days = Array.from({ length: n }, (_, i) => addDays(today, -(n - 1 - i)));
  const present = days.filter((day) => t.has(day));
  const values: string[][][] = [];
  for (let i = 0; i < present.length; i += 5) {
    values.push(...(await read(present.slice(i, i + 5).flatMap((day) => [range(day, "D2:D"), range(day, "F2:F"), range(day, "M2:M")]))));
  }
  const sources = new Map(
    (db().prepare("select id, name from sources").all() as { id: string; name: string }[]).map((s) => [s.id, s.name])
  );
  const data: LightDay[] = days.map((day) => {
    const k = present.indexOf(day);
    const s: LightDay = { day, total: 0, sources: 0, byLang: {}, byGroup: {}, topSources: [] };
    if (k < 0) return s;
    const [src, lang, group] = [values[3 * k], values[3 * k + 1], values[3 * k + 2]];
    const perSource = new Map<string, number>();
    src.forEach((r, i) => {
      if (!r[0]) return;
      s.total++;
      perSource.set(r[0], (perSource.get(r[0]) ?? 0) + 1);
      const l = lang[i]?.[0] || "en";
      s.byLang[l] = (s.byLang[l] ?? 0) + 1;
      const gr = group[i]?.[0] || "Other";
      s.byGroup[gr] = (s.byGroup[gr] ?? 0) + 1;
    });
    s.sources = perSource.size;
    s.topSources = [...perSource].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id, cnt]) => ({ name: sources.get(id) ?? id, n: cnt }));
    return s;
  });
  gStats.__dailyStats = { at: Date.now(), n, data };
  return data;
}

// ---------------------------------------------------------------------------
// Translate button: write one title_en into the sheet
// ---------------------------------------------------------------------------

/**
 * Write an English headline into the article's row (column J of its day
 * tab) — only if that cell is still empty: the first translation wins (the
 * cloud translator and the PC follow the same rule). Returns the
 * translation already there, if any.
 */
export async function writeTitleEn(tab: string, articleId: string, titleEn: string): Promise<{ saved: boolean; existing?: string }> {
  if (!DATE_TAB.test(tab)) return { saved: false };
  const [ids, jcol] = await read([range(tab, "A1:A"), range(tab, "J1:J")]);
  const row = ids.findIndex((r) => r[0] === articleId);
  if (row < 1) return { saved: false };
  const existing = jcol[row]?.[0];
  if (existing) return { saved: false, existing };
  await call("POST", "/values:batchUpdate", {
    valueInputOption: "RAW",
    data: [{ range: range(tab, `J${row + 1}`), values: [[titleEn]] }],
  });
  return { saved: true };
}
