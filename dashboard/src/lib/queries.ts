import { db } from "@/lib/db";
import { PAGE_SIZE, timeWindow, type Filters } from "@/lib/filters";
import { mutePhraseQuery, phrasePanelQuery, searchQuery, watchlistQuery } from "@/lib/match";
import type { Article, Category, Folder, MuteRule, Page, Source, Story, Watchlist } from "@/lib/types";

// ---------------------------------------------------------------------------
// Shared article filtering
// ---------------------------------------------------------------------------

/** Where an article sits in time: publish time, or fetch time if undated. */
const WHEN = "coalesce(a.published_at, a.fetched_at)";
const FTS = (q: string) => `a.rowid in (select rowid from articles_fts where articles_fts match ${q})`;

export interface Scope {
  /** Muted articles: hidden (default), the only ones shown, or not considered. */
  muted?: "exclude" | "only" | "include";
  /** Extra full-text condition, e.g. a watchlist's terms. */
  fts?: string | null;
  folderId?: number;
  /** Saved in any folder. */
  savedAny?: boolean;
  /** Reached this PC after this time (ISO). */
  syncedAfter?: string;
  /** Published (or fetched, if undated) before this time (ISO). */
  before?: string;
  storyId?: number;
  /** Leave out articles removed from this watchlist (or, with removedOnly, show only them). */
  watchlistId?: number;
  removedOnly?: boolean;
}

/** SQL condition selecting muted articles (false when there are no rules). */
function muteCondition(params: unknown[]): string {
  const rules = listMuteRules();
  const phrases = rules.filter((r) => r.kind === "phrase").map((r) => r.value);
  const sources = rules.filter((r) => r.kind === "source").map((r) => r.value);
  const cats = rules.filter((r) => r.kind === "category").map((r) => r.value);
  const parts: string[] = [];
  const pq = mutePhraseQuery(phrases);
  if (pq) {
    parts.push(FTS("?"));
    params.push(pq);
  }
  if (sources.length) {
    parts.push(`a.source_id in (${sources.map(() => "?").join(",")})`);
    params.push(...sources);
  }
  if (cats.length) {
    parts.push(`a.category in (${cats.map(() => "?").join(",")})`);
    params.push(...cats);
  }
  return parts.length ? `(${parts.join(" or ")})` : "0";
}

/** WHERE clause + params for filters within a scope. */
export function articleWhere(f: Partial<Filters>, scope: Scope = {}): { sql: string; params: unknown[] } {
  const where: string[] = [];
  const params: unknown[] = [];

  const { since, until } = timeWindow({ range: f.range || "", from: f.from || "", to: f.to || "" });
  if (since) (where.push(`${WHEN} >= ?`), params.push(since));
  if (until) (where.push(`${WHEN} < ?`), params.push(until));
  if (f.group) (where.push("a.category_group = ?"), params.push(f.group));
  // A topic matches the outlet's category or a per-article tag (e.g. sports
  // news from a general outlet, tagged by local/topics.py).
  if (f.cat) {
    where.push("(a.category = ? or a.id in (select article_id from article_topics where topic = ?))");
    params.push(f.cat, f.cat);
  }
  if (f.lang) (where.push("a.language = ?"), params.push(f.lang));
  if (f.src?.length) {
    where.push(`a.source_id in (${f.src.map(() => "?").join(",")})`);
    params.push(...f.src);
  }
  const sq = searchQuery(f.q || "", f.mode || "all", f.also || [], f.fields || "all");
  if (sq) (where.push(FTS("?")), params.push(sq));
  const pq = phrasePanelQuery([...(f.drill || []), ...(f.ng ? [f.ng] : [])], f.ngin || "title");
  if (pq) (where.push(FTS("?")), params.push(pq));
  if (scope.fts) (where.push(FTS("?")), params.push(scope.fts));
  if (scope.folderId !== undefined) {
    where.push("a.id in (select article_id from saved_items where folder_id = ?)");
    params.push(scope.folderId);
  }
  if (scope.savedAny) where.push("a.id in (select article_id from saved_items)");
  if (scope.syncedAfter) (where.push("a.synced_at > ?"), params.push(scope.syncedAfter));
  if (scope.before) (where.push(`${WHEN} < ?`), params.push(scope.before));
  if (scope.watchlistId !== undefined) {
    where.push(`a.id ${scope.removedOnly ? "in" : "not in"} (select article_id from watchlist_removed where watchlist_id = ?)`);
    params.push(scope.watchlistId);
  }
  if (scope.storyId !== undefined) {
    where.push("a.id in (select article_id from article_story where story_id = ?)");
    params.push(scope.storyId);
  }
  const muted = scope.muted ?? "exclude";
  if (muted !== "include") {
    const m = muteCondition(params);
    where.push(muted === "only" ? m : `not ${m}`);
  }
  return { sql: where.length ? `where ${where.join(" and ")}` : "", params };
}

const ARTICLE_COLUMNS = `
  a.id, a.source_id, a.title, a.title_en, a.url, a.guid, a.description, a.author, a.image_url,
  a.language, a.category_group, a.category, a.topic, a.published_at, a.fetched_at, a.synced_at, a.sheet_tab,
  s.name as source_name, s.language as source_language, s.category_group as source_group,
  x.story_id, st.source_count as story_sources,
  exists (select 1 from saved_items si where si.article_id = a.id) as saved`;

const ARTICLE_JOINS = `
  from articles a
  left join sources s on s.id = a.source_id
  left join article_story x on x.article_id = a.id
  left join stories st on st.id = x.story_id`;

function toArticle(r: any): Article {
  const { source_name, source_language, source_group, saved, muted, ...a } = r;
  return {
    ...a,
    saved: !!saved,
    muted: !!muted,
    source: source_name
      ? { id: a.source_id, name: source_name, language: source_language, category_group: source_group }
      : undefined,
  };
}

/** One page of articles for any section. */
export function fetchArticlesPage(f: Partial<Filters>, scope: Scope = {}, pageSize = PAGE_SIZE): Page<Article> {
  const { sql, params } = articleWhere(f, scope);
  const total = (db().prepare(`select count(*) as n from articles a ${sql}`).get(...params) as { n: number }).n;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(f.page || 1, pages);
  const dir = f.order === "asc" ? "asc" : "desc";
  const order = f.sort === "fetched" ? `a.fetched_at ${dir}` : `${WHEN} ${dir}`;
  // Where muted articles are shown alongside others, flag them for the card.
  const flagParams: unknown[] = [];
  const mutedCol = scope.muted === "include" ? `, ${muteCondition(flagParams)} as muted` : "";
  const noteJoin = scope.folderId !== undefined ? "left join saved_items sn on sn.article_id = a.id and sn.folder_id = ?" : "";
  const noteCol = scope.folderId !== undefined ? ", sn.note as note" : "";
  const rows = db()
    .prepare(`select ${ARTICLE_COLUMNS}${noteCol}${mutedCol} ${ARTICLE_JOINS} ${noteJoin} ${sql} order by ${order} limit ? offset ?`)
    .all(...flagParams, ...(scope.folderId !== undefined ? [scope.folderId] : []), ...params, pageSize, (page - 1) * pageSize);
  return { items: rows.map(toArticle), total, page, pages };
}

// ---------------------------------------------------------------------------
// Raw export (every field, nothing hidden)
// ---------------------------------------------------------------------------

export interface RawArticle {
  id: string;
  published_at: string | null;
  fetched_at: string;
  synced_at: string;
  source_id: string;
  source_name: string | null;
  language: string;
  title: string;
  title_en: string | null;
  description: string | null;
  author: string | null;
  url: string;
  image_url: string | null;
  guid: string | null;
  category_group: string | null;
  category: string | null;
  topic: string | null;
  sheet_tab: string | null;
  translated_at: string | null;
  story_id: number | null;
  muted: number;
  saved_in: string | null; // folder names
}

export const RAW_COLUMNS: (keyof RawArticle)[] = [
  "id", "published_at", "fetched_at", "synced_at", "source_id", "source_name", "language", "title", "title_en",
  "description", "author", "url", "image_url", "guid", "category_group", "category", "topic", "sheet_tab",
  "translated_at", "story_id", "muted", "saved_in",
];

function rawSelect(f: Partial<Filters>) {
  // Muted articles are included and flagged, not hidden.
  const flagParams: unknown[] = [];
  const muted = muteCondition(flagParams);
  const { sql, params } = articleWhere(f, { muted: "include" });
  const order = f.sort === "fetched" ? "a.fetched_at desc" : `${WHEN} desc`;
  return {
    sql: `select a.id, a.published_at, a.fetched_at, a.synced_at, a.source_id, s.name as source_name, a.language,
                 a.title, a.title_en, a.description, a.author, a.url, a.image_url, a.guid, a.category_group,
                 a.category, a.topic, a.sheet_tab, a.translated_at, x.story_id, ${muted} as muted,
                 (select group_concat(fo.name, '; ') from saved_items si join folders fo on fo.id = si.folder_id
                   where si.article_id = a.id) as saved_in
          from articles a left join sources s on s.id = a.source_id left join article_story x on x.article_id = a.id
          ${sql} order by ${order}`,
    params: [...flagParams, ...params],
    countSql: `select count(*) as n from articles a ${sql}`,
    countParams: params,
  };
}

/**
 * One slice of matching rows, for CSV export. Sliced queries rather than one
 * open iterator: better-sqlite3 blocks the shared connection while an
 * iterator is open, which would fail every other request during an export.
 */
export function rawSlice(f: Partial<Filters>, offset: number, limit: number): RawArticle[] {
  const q = rawSelect(f);
  return db().prepare(`${q.sql} limit ? offset ?`).all(...q.params, limit, offset) as RawArticle[];
}

/** Text of matching articles (for n-grams / related terms); newest first. */
export function fetchArticleTexts(f: Partial<Filters>, scope: Scope = {}, limit = 20000) {
  const { sql, params } = articleWhere(f, scope);
  return db()
    .prepare(
      `select a.title, a.title_en, a.description, a.language, a.source_id from articles a ${sql}
       order by ${WHEN} desc limit ?`
    )
    .all(...params, limit) as { title: string; title_en: string | null; description: string | null; language: string; source_id: string }[];
}

export function countArticles(f: Partial<Filters>, scope: Scope = {}): number {
  const { sql, params } = articleWhere(f, scope);
  return (db().prepare(`select count(*) as n from articles a ${sql}`).get(...params) as { n: number }).n;
}

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

export async function fetchCategories(): Promise<Category[]> {
  return db()
    .prepare('select slug, "group", name, sort, active from categories where active = 1 order by sort')
    .all()
    .map((c: any) => ({ ...c, active: !!c.active }));
}

export async function fetchSources(): Promise<Source[]> {
  return db()
    .prepare(
      `select s.*, (select count(*) from articles a where a.source_id = s.id) as article_count
       from sources s order by s.name`
    )
    .all()
    .map((s: any) => ({ ...s, active: !!s.active }));
}

/** Options for the filter bar. */
export function filterOptions() {
  const d = db();
  return {
    groups: (d.prepare('select distinct "group" as g from categories where active = 1 order by sort').all() as { g: string }[]).map((r) => r.g),
    categories: d.prepare('select slug, "group", name from categories where active = 1 order by sort').all() as { slug: string; group: string; name: string }[],
    sources: d.prepare("select id, name, language from sources order by name").all() as { id: string; name: string; language: string }[],
    // From sources, so a newly added language shows before its first articles arrive.
    languages: (d.prepare("select distinct language as l from sources union select distinct language from articles order by 1").all() as { l: string }[]).map((r) => r.l),
  };
}

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------

/**
 * Stories with at least minSources outlets whose member articles match the
 * filters (dates filter on member articles, so "last 24h" = active in the
 * last 24h), ranked by coverage then recency.
 */
export type StorySort = "coverage" | "recent" | "avg_newest" | "avg_oldest";

const STORY_ORDER: Record<StorySort, string> = {
  coverage: "n_src desc, last_w desc",
  recent: "last_w desc",
  avg_newest: "avg_jd desc",
  avg_oldest: "avg_jd asc",
};

/**
 * Stories built from the articles that match the filters. With a language,
 * group or source filter, a story's outlet/article counts, time span and
 * headline come from those articles only — "Kannada" shows stories as the
 * Kannada outlets covered them. minSources applies to that filtered count.
 * onlyLanguage: also require that no outlet in another language covered it.
 */
export function fetchStoriesPage(
  f: Partial<Filters>,
  minSources = 2,
  pageSize = 30,
  sort: StorySort = "coverage",
  onlyLanguage = false
): Page<Story> {
  const { sql, params } = articleWhere(f);
  const narrowed = !!(f.lang || f.group || f.src?.length);
  const exclusive = onlyLanguage && f.lang;
  const cte = `
    with m as (
      select x.story_id, a.id, a.source_id, a.language, a.title, a.title_en, ${WHEN} as w
      from article_story x join articles a on a.id = x.article_id ${sql}
    ),
    agg as (
      select story_id, count(distinct source_id) as n_src, count(*) as n_art,
             min(w) as first_w, max(w) as last_w, avg(julianday(w)) as avg_jd
      from m group by story_id
      having count(distinct source_id) >= ?
    )`;
  const exclusiveSql = exclusive
    ? `and not exists (select 1 from article_story y join articles b on b.id = y.article_id
                       where y.story_id = agg.story_id and b.language <> ?)`
    : "";
  const cteParams = [...params, minSources];
  const exParams = exclusive ? [f.lang] : [];
  const total = (
    db().prepare(`${cte} select count(*) as n from agg where 1 ${exclusiveSql}`).get(...cteParams, ...exParams) as { n: number }
  ).n;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(f.page || 1, pages);
  // Headline: the story's own, or — when narrowed — the earliest matching
  // article's English headline (an English outlet's own wording first).
  const title = narrowed
    ? `(select case when m2.language = 'en' then m2.title else coalesce(m2.title_en, m2.title) end
        from m m2 where m2.story_id = agg.story_id order by (m2.language = 'en') desc, m2.w limit 1)`
    : "st.title";
  const rows = db()
    .prepare(
      `${cte}
       select st.id, ${title} as title, agg.first_w as first_seen, agg.last_w as last_seen,
              agg.n_art as article_count, agg.n_src as source_count,
              st.source_count as total_sources, st.article_count as total_articles,
              strftime('%Y-%m-%dT%H:%M:%SZ', agg.avg_jd) as avg_published,
              st.en_sources, st.kn_sources, st.hi_sources
       from agg join stories st on st.id = agg.story_id
       where 1 ${exclusiveSql}
       order by ${STORY_ORDER[sort]} limit ? offset ?`
    )
    .all(...cteParams, ...exParams, pageSize, (page - 1) * pageSize) as Story[];
  return { items: rows, total, page, pages };
}

/** Outlets per language for a story (all its articles). */
export function storyLanguages(id: number): { language: string; sources: number }[] {
  return db()
    .prepare(
      `select coalesce(s.language, a.language) as language, count(distinct a.source_id) as sources
       from article_story x join articles a on a.id = x.article_id left join sources s on s.id = a.source_id
       where x.story_id = ? group by 1 order by sources desc`
    )
    .all(id) as { language: string; sources: number }[];
}

export function fetchStory(id: number): Story | undefined {
  return db().prepare("select * from stories where id = ?").get(id) as Story | undefined;
}

/** Every article of a story, oldest first (a timeline). */
export function fetchStoryArticles(id: number): Article[] {
  return db()
    .prepare(`select ${ARTICLE_COLUMNS} ${ARTICLE_JOINS} where x.story_id = ? order by ${WHEN} asc`)
    .all(id)
    .map(toArticle);
}

// ---------------------------------------------------------------------------
// Watchlists
// ---------------------------------------------------------------------------

/** A watchlist's matches: its terms, muted articles included, minus hand-removed ones. */
export function watchlistScope(w: Pick<Watchlist, "id" | "terms" | "fields">, removedOnly = false): Scope | null {
  const q = watchlistQuery(w.terms, w.fields);
  return q ? { fts: q, muted: "include", watchlistId: w.id, removedOnly } : null;
}

export function countRemovedFromWatchlist(id: number): number {
  return (db().prepare("select count(*) as n from watchlist_removed where watchlist_id = ?").get(id) as { n: number }).n;
}

export function listWatchlists(): Watchlist[] {
  const d = db();
  const hourAgo = new Date(Date.now() - 3600_000).toISOString();
  return (d.prepare("select * from watchlists order by sort, id").all() as Watchlist[]).map((w) => {
    const scope = watchlistScope(w);
    if (!scope) return { ...w, total: 0, unread: 0, last_hour_sources: 0 };
    const { sql, params } = articleWhere({}, scope);
    const total = (d.prepare(`select count(*) as n from articles a ${sql}`).get(...params) as { n: number }).n;
    const unread = (
      d.prepare(`select count(*) as n from articles a ${sql} and a.synced_at > ?`).get(...params, w.last_viewed_at || "") as { n: number }
    ).n;
    // Spike signal: distinct outlets with a match in the last hour.
    const last_hour_sources = (
      d.prepare(`select count(distinct a.source_id) as n from articles a ${sql} and ${WHEN} >= ?`).get(...params, hourAgo) as { n: number }
    ).n;
    return { ...w, total, unread, last_hour_sources };
  });
}

export function getWatchlist(id: number): Watchlist | undefined {
  return db().prepare("select * from watchlists where id = ?").get(id) as Watchlist | undefined;
}

/**
 * For bookkeeping writes made while rendering a page (visit times): if a
 * background job holds the write lock, skip rather than hold up the page
 * (the default busy timeout would wait up to 30s). Returns false if skipped.
 */
export function tryWrite(fn: () => void): boolean {
  const conn = db();
  conn.pragma("busy_timeout = 0");
  try {
    fn();
    return true;
  } catch {
    return false; // locked — the next visit records it
  } finally {
    conn.pragma("busy_timeout = 30000");
  }
}

export function markWatchlistViewed(id: number) {
  tryWrite(() =>
    db().prepare("update watchlists set last_viewed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') where id = ?").run(id)
  );
}

/** Spike threshold for the watchlist badge: this many outlets within an hour. */
export const SPIKE_SOURCES = 3;

// ---------------------------------------------------------------------------
// Saved / folders
// ---------------------------------------------------------------------------

export function listFolders(): Folder[] {
  return db()
    .prepare(
      `select f.id, f.name, (select count(*) from saved_items s where s.folder_id = f.id) as count
       from folders f order by f.name collate nocase`
    )
    .all() as Folder[];
}

/** Folder ids an article is saved in. */
export function savedFolderIds(articleId: string): number[] {
  return (db().prepare("select folder_id from saved_items where article_id = ?").all(articleId) as { folder_id: number }[]).map(
    (r) => r.folder_id
  );
}

// ---------------------------------------------------------------------------
// Muting
// ---------------------------------------------------------------------------

export function listMuteRules(): MuteRule[] {
  return db().prepare("select id, kind, value from mute_rules order by kind, value collate nocase").all() as MuteRule[];
}

// ---------------------------------------------------------------------------
// App state (e.g. last visit)
// ---------------------------------------------------------------------------

export function getState(key: string): string | null {
  const r = db().prepare("select value from app_state where key = ?").get(key) as { value: string } | undefined;
  return r?.value ?? null;
}

export function setState(key: string, value: string) {
  db()
    .prepare("insert into app_state (key, value) values (?, ?) on conflict (key) do update set value = excluded.value")
    .run(key, value);
}
