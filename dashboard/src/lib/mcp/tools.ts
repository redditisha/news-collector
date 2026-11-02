import { db } from "@/lib/db";
import { addDays, istDayStart, istToday, RANGES, type Filters } from "@/lib/filters";
import { collectorRuns, sourceNames } from "@/lib/logs";
import { HOSTED, HOSTED_MAX_DAYS } from "@/lib/mode";
import { computeNgrams, trendingPhrases, type TextField } from "@/lib/ngrams";
import { getPipelineStatus } from "@/lib/pipeline";
import {
  fetchArticlesPage,
  fetchArticleTexts,
  fetchSources,
  fetchStoriesPage,
  fetchStory,
  filterOptions,
  getWatchlist,
  listWatchlists,
  storyLanguages,
  watchlistScope,
  type StorySort,
} from "@/lib/queries";
import { dayTabs, ensureData, hostedDailyStats, hostedFilters, sheetHealth } from "@/lib/sheetdata";
import type { Article } from "@/lib/types";
import { addEvent, deleteEvent, getEvent, listEvents, updateEvent } from "@/lib/calendar";
import { CALENDAR_CATEGORIES, STATE_NAMES } from "@/lib/calendarMeta";

/**
 * Read-only tools for the News Monitor MCP server (/api/mcp). Online they
 * read the Google Sheet — the latest ~150,000 articles (about 11 days), with
 * translations, stories and watchlists; on the PC they read the full archive.
 * Each tool returns JSON as text.
 */

type Args = Record<string, any>;
export interface Tool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  /** Changes data (calendar only); needs the server key. */
  writes?: boolean;
  run: (args: Args) => Promise<unknown>;
}

const LANGS = "en (English), kn (Kannada), hi (Hindi), ta (Tamil), te (Telugu)";
const filterProps = {
  query: { type: "string", description: "Words to search for in headlines (original or English translation) and summaries." },
  match: { type: "string", enum: ["all", "any", "phrase"], description: "How query words match: all (default), any, or the exact phrase." },
  headlines_only: { type: "boolean", description: "Search headlines only, not summaries." },
  language: { type: "string", description: `Language code: ${LANGS}.` },
  group: { type: "string", description: "Category group: India, World, Business or Specialized." },
  topic: { type: "string", description: "Topic slug, e.g. politics, economy, business, markets, technology, defence, infrastructure, judiciary, states, world, ai, startups, sports, global-business." },
  sources: { type: "array", items: { type: "string" }, description: "Outlet names (or ids), e.g. [\"Prajavani\", \"The Hindu\"]. Partial names match." },
  range: { type: "string", enum: ["6h", "24h", "7d"], description: "Recent window (default 24h). Ignored if from/to are given." },
  from: { type: "string", description: "Start date YYYY-MM-DD (Indian time), inclusive." },
  to: { type: "string", description: "End date YYYY-MM-DD (Indian time), inclusive." },
};

const clampInt = (v: unknown, def: number, min: number, max: number) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};

function sourceIds(names: unknown): string[] {
  if (!Array.isArray(names) || !names.length) return [];
  const all = filterOptions().sources;
  const ids = new Set<string>();
  for (const raw of names) {
    const q = String(raw).toLowerCase();
    for (const s of all) if (s.id === raw || s.name.toLowerCase().includes(q)) ids.add(s.id);
  }
  return [...ids];
}

/** Tool arguments -> the app's Filters (same meaning as the web filters). */
function toFilters(a: Args, defaultRange = "24h"): Filters {
  const isDate = (s: unknown) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const range = RANGES.some((r) => r.value === a.range) ? a.range : defaultRange;
  const f: Filters = {
    q: typeof a.query === "string" ? a.query.trim() : "",
    mode: a.match === "any" || a.match === "phrase" ? a.match : "all",
    fields: a.headlines_only ? "title" : "all",
    also: [],
    range: isDate(a.from) || isDate(a.to) ? "" : range,
    from: isDate(a.from) ? a.from : "",
    to: isDate(a.to) ? a.to : "",
    group: typeof a.group === "string" ? a.group : "",
    cat: typeof a.topic === "string" ? a.topic : "",
    src: sourceIds(a.sources),
    lang: typeof a.language === "string" ? a.language : "",
    sort: a.sort === "collected" ? "fetched" : "published",
    order: a.order === "oldest" ? "asc" : "desc",
    page: clampInt(a.page, 1, 1, 1000),
    drill: [],
    ng: "",
    ngin: "title",
  };
  return hostedFilters(f, defaultRange);
}

const short = (s: string | null | undefined, n: number) => (s && s.length > n ? `${s.slice(0, n)}…` : s || null);

function articleOut(a: Article) {
  return {
    id: a.id,
    published: a.published_at || a.fetched_at,
    outlet: a.source?.name ?? a.source_id,
    language: a.language,
    headline: a.title,
    headline_en: a.language === "en" ? a.title : a.title_en,
    summary: short(a.description, 280),
    topic: a.category,
    group: a.category_group,
    url: a.url,
    story_id: a.story_id ?? null,
    story_outlets: a.story_sources ?? null,
  };
}

function windowNote(f: Filters) {
  return HOSTED
    ? `Online data: the latest ~150,000 articles; one query covers at most ${HOSTED_MAX_DAYS} days.`
    : "PC archive: every article since September 2026.";
}

export const TOOLS: Tool[] = [
  {
    name: "overview",
    description:
      "Start here. What the data covers and how fresh it is: days available and articles per day, languages, outlets, " +
      "when feeds were last collected, the cloud translator's last run, the PC's last sync, and how full the sheet is.",
    inputSchema: { type: "object", properties: {} },
    async run() {
      await ensureData({ filters: { range: "24h" } });
      const [pipeline, health] = [await getPipelineStatus(), await sheetHealth()];
      const days = HOSTED
        ? (await dayTabs()).map((d) => ({ day: d.day, articles: d.rows }))
        : (db()
            .prepare(
              `select date(datetime(coalesce(published_at, fetched_at), '+330 minutes')) as day, count(*) as articles
               from articles group by day order by day desc limit 40`
            )
            .all() as { day: string; articles: number }[]);
      const opts = filterOptions();
      return {
        source: HOSTED ? "Google Sheet (online)" : "PC archive",
        note: windowNote({} as Filters),
        today_ist: istToday(),
        days: days.slice(0, 40),
        languages: opts.languages,
        groups: opts.groups,
        topics: opts.categories.map((c) => c.slug),
        outlets: opts.sources.length,
        last_collected: pipeline.lastCollectedAt,
        collector_freshness: pipeline.freshness,
        cloud_translator: pipeline.cloud,
        pc_last_sync: pipeline.pc?.lastOkSyncAt ?? pipeline.lastSync?.finished_at ?? null,
        sheet: health ? { articles: health.rows, percent_of_limit: Math.round(health.fill * 100), copied_to_pc: health.copied } : null,
      };
    },
  },
  {
    name: "top_stories",
    description:
      "Stories: the same event grouped across outlets and languages, most widely covered first (or newest). " +
      "Use for 'what news is doing well / biggest stories today'. Filters narrow which articles count, e.g. language=kn " +
      "shows stories as Kannada outlets covered them.",
    inputSchema: {
      type: "object",
      properties: {
        ...filterProps,
        min_outlets: { type: "integer", description: "Only stories covered by at least this many outlets (default 2)." },
        sort: { type: "string", enum: ["coverage", "recent", "avg_newest", "avg_oldest"], description: "coverage (default) = most outlets first." },
        only_this_language: { type: "boolean", description: "With language: only stories no other language covered." },
        limit: { type: "integer", description: "Stories to return (default 15, max 50)." },
        page: { type: "integer" },
      },
    },
    async run(a) {
      const f = toFilters(a, "24h");
      await ensureData({ filters: f });
      const sort: StorySort = ["coverage", "recent", "avg_newest", "avg_oldest"].includes(a.sort) ? a.sort : "coverage";
      const page = fetchStoriesPage(f, clampInt(a.min_outlets, 2, 1, 100), clampInt(a.limit, 15, 1, 50), sort, !!a.only_this_language && !!f.lang);
      return {
        note: windowNote(f),
        window: { range: f.range, from: f.from, to: f.to },
        total: page.total,
        page: page.page,
        pages: page.pages,
        stories: page.items.map((s) => ({
          id: s.id,
          headline: s.title,
          outlets: s.source_count,
          articles: s.article_count,
          total_outlets: s.total_sources,
          first_seen: s.first_seen,
          last_seen: s.last_seen,
          average_published: s.avg_published,
          languages: storyLanguages(s.id),
        })),
      };
    },
  },
  {
    name: "story",
    description: "One story in detail: headline, which outlets in which languages covered it, and its articles in time order.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "integer", description: "Story id (from top_stories or search_articles)." },
        language: { type: "string", description: `Only articles in this language: ${LANGS}.` },
        limit: { type: "integer", description: "Articles to return (default 40, max 200)." },
      },
      required: ["id"],
    },
    async run(a) {
      const id = Number(a.id);
      await ensureData({ storyId: id });
      const s = fetchStory(id);
      if (!s) return { error: `No story ${id} in the data.` };
      const items = fetchArticlesPage({ range: "all", lang: a.language || "", order: "asc" }, { storyId: id, muted: "include" }, clampInt(a.limit, 40, 1, 200)).items;
      return {
        id: s.id,
        headline: s.title,
        outlets: s.source_count,
        articles: s.article_count,
        first_seen: s.first_seen,
        last_seen: s.last_seen,
        languages: storyLanguages(id),
        timeline: items.map(articleOut),
      };
    },
  },
  {
    name: "search_articles",
    description: "Find articles: keywords (any language, translations included), language, outlets, topic, dates. Newest first.",
    inputSchema: {
      type: "object",
      properties: {
        ...filterProps,
        sort: { type: "string", enum: ["published", "collected"], description: "Order by publish time (default) or collection time." },
        order: { type: "string", enum: ["newest", "oldest"] },
        limit: { type: "integer", description: "Articles per page (default 20, max 100)." },
        page: { type: "integer" },
      },
    },
    async run(a) {
      const f = toFilters(a, "24h");
      await ensureData({ filters: f });
      const page = fetchArticlesPage(f, {}, clampInt(a.limit, 20, 1, 100));
      return { note: windowNote(f), window: { range: f.range, from: f.from, to: f.to }, total: page.total, page: page.page, pages: page.pages, articles: page.items.map(articleOut) };
    },
  },
  {
    name: "trending",
    description:
      "Phrases rising in the last 6 hours compared with the days before (e.g. a new event breaking). " +
      "Optionally for one language, group or topic.",
    inputSchema: {
      type: "object",
      properties: { language: filterProps.language, group: filterProps.group, topic: filterProps.topic, limit: { type: "integer", description: "Default 15." } },
    },
    async run(a) {
      const base = { group: a.group || "", cat: a.topic || "", lang: a.language || "" };
      await ensureData({ filters: { range: HOSTED ? "24h" : "7d" } });
      const recent = fetchArticleTexts({ ...base, range: "6h" });
      const before = new Date(Date.now() - 6 * 3600_000).toISOString();
      const baseline = fetchArticleTexts({ ...base, range: "7d" }, { before });
      return {
        recent_articles: recent.length,
        baseline_articles: baseline.length,
        trending: trendingPhrases(recent, baseline, { minSources: 3, limit: clampInt(a.limit, 15, 1, 50) }).map((t) => ({
          phrase: t.phrase,
          outlets_last_6h: t.sources,
          lift: Math.round(t.lift * 10) / 10,
        })),
      };
    },
  },
  {
    name: "phrases",
    description: "Most frequent 1-3 word phrases in the articles matching the filters (n-grams), counted by outlets or articles.",
    inputSchema: {
      type: "object",
      properties: {
        ...filterProps,
        n: { type: "integer", description: "Phrase length 1-3 (default 2)." },
        text: { type: "string", enum: ["en", "original", "summary"], description: "English headlines (default, translations included), original headlines, or summaries." },
        count_by: { type: "string", enum: ["sources", "articles"], description: "Count outlets (default) or articles." },
        story_id: { type: "integer", description: "Only this story's articles." },
        watchlist: { type: "string", description: "Only this watchlist's matches (name or id)." },
        limit: { type: "integer", description: "Default 40." },
      },
    },
    async run(a) {
      const f = toFilters(a, "24h");
      let scope = {};
      if (a.story_id) {
        await ensureData({ storyId: Number(a.story_id) });
        scope = { storyId: Number(a.story_id), muted: "include" };
      } else {
        await ensureData({ filters: f });
        if (a.watchlist) {
          const w = findWatchlist(a.watchlist);
          if (!w) return { error: `No watchlist "${a.watchlist}".` };
          scope = watchlistScope(w) ?? {};
        }
      }
      const rows = fetchArticleTexts(a.story_id ? { range: "all" } : f, scope);
      const field = (["en", "original", "summary"].includes(a.text) ? a.text : "en") as TextField;
      return {
        articles_analysed: rows.length,
        phrases: computeNgrams(rows, {
          field,
          n: clampInt(a.n, 2, 1, 3),
          stopwords: true,
          minCount: 2,
          by: a.count_by === "articles" ? "articles" : "sources",
          limit: clampInt(a.limit, 40, 1, 200),
        }),
      };
    },
  },
  {
    name: "watchlists",
    description: "Tracked keywords (watchlists) — e.g. people, places, projects — with their terms and how many articles match.",
    inputSchema: { type: "object", properties: {} },
    async run() {
      await ensureData({ filters: { range: "7d" } });
      return listWatchlists().map((w) => ({
        id: w.id,
        name: w.name,
        terms: w.terms.split("\n"),
        match_in: w.fields === "title" ? "headlines" : "headlines and summaries",
        matches_in_data: w.total,
        outlets_last_hour: w.last_hour_sources,
      }));
    },
  },
  {
    name: "watchlist_matches",
    description: "Articles matching one watchlist (e.g. 'DK Shivakumar'), newest first, with all the usual filters.",
    inputSchema: {
      type: "object",
      properties: {
        watchlist: { type: "string", description: "Watchlist name (partial ok) or id." },
        ...filterProps,
        limit: { type: "integer", description: "Default 20, max 100." },
        page: { type: "integer" },
      },
      required: ["watchlist"],
    },
    async run(a) {
      await ensureData();
      const w = findWatchlist(a.watchlist);
      if (!w) return { error: `No watchlist "${a.watchlist}". Use the watchlists tool to see them.` };
      const f = toFilters(a, "7d");
      await ensureData({ filters: f });
      const scope = watchlistScope(w);
      const page = scope ? fetchArticlesPage(f, scope, clampInt(a.limit, 20, 1, 100)) : { items: [], total: 0, page: 1, pages: 1 };
      return { watchlist: w.name, terms: w.terms.split("\n"), window: { range: f.range, from: f.from, to: f.to }, total: page.total, page: page.page, pages: page.pages, articles: page.items.map(articleOut) };
    },
  },
  {
    name: "daily_stats",
    description: "Articles per day for recent days, split by language and group, with each day's top outlets.",
    inputSchema: { type: "object", properties: { days: { type: "integer", description: "Days back (default 7, max 15)." } } },
    async run(a) {
      const n = clampInt(a.days, 7, 1, 15);
      if (HOSTED) return hostedDailyStats(n);
      const since = istDayStart(addDays(istToday(), -(n - 1)));
      const IST = "date(datetime(coalesce(a.published_at, a.fetched_at), '+330 minutes'))";
      const rows = db()
        .prepare(`select ${IST} as day, a.language as language, coalesce(a.category_group, 'Other') as grp, count(*) as n
                  from articles a where coalesce(a.published_at, a.fetched_at) >= ? group by day, language, grp`)
        .all(since) as { day: string; language: string; grp: string; n: number }[];
      const out = new Map<string, { day: string; total: number; byLang: Record<string, number>; byGroup: Record<string, number> }>();
      for (const r of rows) {
        const d = out.get(r.day) ?? { day: r.day, total: 0, byLang: {}, byGroup: {} };
        d.total += r.n;
        d.byLang[r.language] = (d.byLang[r.language] ?? 0) + r.n;
        d.byGroup[r.grp] = (d.byGroup[r.grp] ?? 0) + r.n;
        out.set(r.day, d);
      }
      return [...out.values()].sort((x, y) => x.day.localeCompare(y.day));
    },
  },
  {
    name: "outlets",
    description: "All news outlets (feeds) with language, group, region and feed health (last success, last error).",
    inputSchema: {
      type: "object",
      properties: { language: filterProps.language, with_errors_only: { type: "boolean", description: "Only outlets whose last collection failed." } },
    },
    async run(a) {
      await ensureData();
      return (await fetchSources())
        .filter((s) => (!a.language || s.language === a.language) && (!a.with_errors_only || s.last_error))
        .map((s) => ({
          name: s.name,
          language: s.language,
          group: s.category_group,
          topic: s.primary_category,
          region: s.region,
          country: s.country,
          type: s.source_type,
          active: s.active,
          last_success: s.last_success_at,
          last_error: s.last_error,
          articles_in_data: s.article_count,
        }));
    },
  },
  {
    name: "collector_runs",
    description: "Recent runs of the feed collector (every 15 min): when, how many new articles, failed feeds, errors.",
    inputSchema: { type: "object", properties: { limit: { type: "integer", description: "Default 20, max 100." }, failures_only: { type: "boolean" } } },
    async run(a) {
      await ensureData();
      const r = collectorRuns({ page: 1, pageSize: clampInt(a.limit, 20, 1, 100), status: a.failures_only ? "error" : undefined });
      const names = sourceNames();
      return r.items.map((x) => ({
        started: x.started_at,
        trigger: x.trigger,
        status: x.status,
        seconds: x.duration_ms ? Math.round(x.duration_ms / 1000) : null,
        feeds: x.sources,
        failed_feeds: x.failed,
        new_articles: x.new_articles,
        error: x.error,
        failed: (x.details || []).filter((d) => d.status !== "ok").map((d) => ({ feed: names.get(d.id) ?? d.id, error: d.error })),
      }));
    },
  },
  {
    name: "article",
    description: "One article by id, with its full summary, image and story.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" }, date: { type: "string", description: "Its publish day YYYY-MM-DD, if known (loads that day online)." } },
      required: ["id"],
    },
    async run(a) {
      const isDate = typeof a.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(a.date);
      await ensureData(isDate ? { days: [a.date] } : { filters: { range: "7d" } });
      const row = db()
        .prepare(
          `select a.*, s.name as outlet, x.story_id from articles a left join sources s on s.id = a.source_id
           left join article_story x on x.article_id = a.id where a.id = ?`
        )
        .get(String(a.id)) as any;
      if (!row) return { error: `Article ${a.id} not found${HOSTED ? " in the days loaded (pass its date)" : ""}.` };
      return {
        id: row.id,
        published: row.published_at,
        collected: row.fetched_at,
        outlet: row.outlet,
        language: row.language,
        headline: row.title,
        headline_en: row.language === "en" ? row.title : row.title_en,
        summary: row.description,
        url: row.url,
        image: row.image_url,
        topic: row.category,
        group: row.category_group,
        story_id: row.story_id,
      };
    },
  },
];


const DAY = /^\d{4}-\d{2}-\d{2}$/;
const eventProps = {
  title: { type: "string" },
  category: { type: "string", enum: CALENDAR_CATEGORIES.map((c) => c.key), description: CALENDAR_CATEGORIES.map((c) => `${c.key} = ${c.label}`).join("; ") },
  start: { type: "string", description: "First day, YYYY-MM-DD." },
  end: { type: "string", description: "Last day for multi-day events (inclusive), YYYY-MM-DD; omit for one day." },
  time: { type: "string", description: "Time of day HH:MM (IST), if it matters." },
  states: {
    type: "string",
    description: `Comma-separated state codes for state-specific events (e.g. "KA" or "UP,PB"); omit for all-India. Codes: ${Object.entries(STATE_NAMES).map(([k, v]) => `${k}=${v}`).join(", ")}.`,
  },
  location: { type: "string" },
  description: { type: "string" },
  keywords: { type: "string", description: "Short search terms to find related news (defaults to the title)." },
  link: { type: "string", description: "Official or reference URL." },
  status: { type: "string", enum: ["confirmed", "tentative"], description: "tentative = expected but not officially announced." },
  source: { type: "string", description: "Where the date comes from." },
};

const CALENDAR_TOOLS: Tool[] = [
  {
    name: "calendar_events",
    description:
      "The news calendar: festivals, national and state days, elections and Parliament, PM & leaders, economy (RBI, Budget, GDP), " +
      "tech events, sports, movie releases, exams, weather/farming, courts, remembrance, Bengaluru & Karnataka. " +
      "Events overlapping a date range, filtered by category, state or words. Each has an id for calendar_update/delete.",
    inputSchema: {
      type: "object",
      properties: {
        from: { type: "string", description: "YYYY-MM-DD (default today)." },
        to: { type: "string", description: "YYYY-MM-DD (default 30 days after from)." },
        categories: { type: "array", items: { type: "string", enum: CALENDAR_CATEGORIES.map((c) => c.key) } },
        state: { type: "string", description: "State code: that state's events plus all-India ones." },
        query: { type: "string", description: "Words that must appear in the title, description, keywords or location." },
        status: { type: "string", enum: ["confirmed", "tentative"] },
        limit: { type: "integer", description: "Default 100, max 500." },
      },
    },
    async run(a) {
      const from = DAY.test(a.from || "") ? a.from : istToday();
      const to = DAY.test(a.to || "") ? a.to : addDays(from, 30);
      const items = await listEvents({ from, to, categories: Array.isArray(a.categories) ? a.categories : undefined, state: a.state, query: a.query, status: a.status });
      return { from, to, total: items.length, events: items.slice(0, clampInt(a.limit, 100, 1, 500)) };
    },
  },
  {
    name: "calendar_add",
    description: "Add an event to the news calendar (e.g. an announced election date, a film release, a summit). Returns the new event with its id.",
    inputSchema: { type: "object", properties: eventProps, required: ["title", "category", "start"] },
    writes: true,
    async run(a) {
      return { added: await addEvent(a) };
    },
  },
  {
    name: "calendar_update",
    description: "Change a calendar event: pass its id and only the fields to change (e.g. new dates once announced, status confirmed).",
    inputSchema: { type: "object", properties: { id: { type: "string" }, ...eventProps }, required: ["id"] },
    writes: true,
    async run(a) {
      const { id, ...patch } = a;
      return { updated: await updateEvent(String(id), patch) };
    },
  },
  {
    name: "calendar_delete",
    description: "Remove an event from the news calendar by id (e.g. a duplicate or a cancelled event).",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    writes: true,
    async run(a) {
      const e = await getEvent(String(a.id));
      if (!e) return { error: `No event with id ${a.id}` };
      await deleteEvent(String(a.id));
      return { deleted: e };
    },
  },
];

TOOLS.push(...CALENDAR_TOOLS);

function findWatchlist(q: unknown) {
  const all = listWatchlists();
  const s = String(q ?? "").toLowerCase().trim();
  return all.find((w) => String(w.id) === s) ?? all.find((w) => w.name.toLowerCase() === s) ?? all.find((w) => w.name.toLowerCase().includes(s)) ?? (getWatchlist(Number(s)) || null);
}
