import { ensureData, hostedFilters } from "@/lib/sheetdata";
import Link from "next/link";
import { Shell } from "@/components/Shell";
import { Feed } from "@/components/Feed";
import { FilterBar } from "@/components/FilterBar";
import { StoryCard } from "@/components/StoryCard";
import { parseFilters, toQuery, type Filters } from "@/lib/filters";
import { trendingPhrases } from "@/lib/ngrams";
import {
  countArticles,
  fetchArticleTexts,
  fetchArticlesPage,
  fetchStoriesPage,
  filterOptions,
  getState,
  listWatchlists,
  setState,
  tryWrite,
  watchlistScope,
  SPIKE_SOURCES,
} from "@/lib/queries";
import { timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";

const SESSION_GAP_MS = 30 * 60 * 1000;

/**
 * "Since your last visit" needs the start of the previous session, not the
 * last page load (the page auto-refreshes). A new session starts after 30
 * minutes without a visit.
 */
function trackVisit(): string | null {
  const now = new Date().toISOString();
  const current = getState("visit_current");
  tryWrite(() => {
    if (!current || Date.now() - new Date(current).getTime() > SESSION_GAP_MS) {
      if (current) setState("visit_previous", current);
    }
    setState("visit_current", now);
  });
  return getState("visit_previous");
}

function section(title: string, action?: React.ReactNode) {
  return (
    <div className="mb-2 flex items-baseline justify-between">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
      {action}
    </div>
  );
}

/** Today — the briefing: what's new, your watchlists, trending, top stories, latest. */
export default async function TodayPage({ searchParams }: { searchParams: Record<string, string> }) {
  const f: Filters = hostedFilters(parseFilters(searchParams, { range: "24h" }));
  await ensureData({ filters: f });
  const lastVisit = trackVisit();
  const scopeFilters = { ...f, q: "", also: [], page: 1 };

  // Since last visit (muted articles not counted)
  const sinceCount = lastVisit ? countArticles({}, { syncedAfter: lastVisit }) : null;

  // Watchlists within the window
  const watch = listWatchlists().map((w) => {
    const scope = watchlistScope(w);
    const page = scope ? fetchArticlesPage(scopeFilters, scope, 2) : { items: [], total: 0 };
    return { ...w, inWindow: page.total, latest: page.items };
  });
  const watchNew = watch.reduce((s, w) => s + (w.unread ?? 0), 0);

  // Trending: last 6h vs the 7 days before, same category/source/language filters
  const base = { group: f.group, cat: f.cat, src: f.src, lang: f.lang };
  const sixHoursAgo = new Date(Date.now() - 6 * 3600_000).toISOString();
  const recent = fetchArticleTexts({ ...base, range: "6h" });
  const week = fetchArticleTexts({ ...base, range: "7d" }, { before: sixHoursAgo }); // baseline excludes the recent window
  const trending = trendingPhrases(recent, week, { minSources: 3, limit: 14 });

  const stories = fetchStoriesPage(scopeFilters, 2, 6).items;
  const latest = fetchArticlesPage(scopeFilters, {}, 20);
  const browseHref = `/browse${toQuery({ ...scopeFilters, range: f.range })}`;

  return (
    <Shell
      title="Today"
      subtitle={
        lastVisit ? (
          <span suppressHydrationWarning>
            Since your last visit ({timeAgo(lastVisit)}): <b>{(sinceCount ?? 0).toLocaleString()}</b> new articles
            {watchNew ? (
              <>
                , <b>{watchNew}</b> in your watchlists
              </>
            ) : null}
          </span>
        ) : (
          "Your briefing"
        )
      }
    >
      <FilterBar filters={f} options={filterOptions()} search={false} sort={false} defaultRange="24h" />

      <section className="mb-6">
        {section("Watchlists", <Link href="/watchlists" className="text-xs text-brand hover:underline">Manage</Link>)}
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {watch.map((w) => (
            <Link key={w.id} href={`/watchlists/${w.id}${toQuery({ range: f.range, from: f.from, to: f.to })}`} className="rounded-xl border border-slate-200 bg-white p-3 transition hover:border-brand">
              <div className="flex items-center gap-2">
                <span className="flex-1 truncate font-semibold text-ink">{w.name}</span>
                {(w.last_hour_sources ?? 0) >= SPIKE_SOURCES ? (
                  <span className="text-xs font-semibold text-red-600" title="Several outlets in the last hour">● spike</span>
                ) : null}
                {w.unread ? <span className="rounded-full bg-brand px-2 text-xs font-semibold text-white">{w.unread} new</span> : null}
              </div>
              <div className="mb-1 text-xs text-slate-500">{w.inWindow} in this period</div>
              {w.latest.length ? (
                <ul className="space-y-0.5">
                  {w.latest.map((a) => (
                    <li key={a.id} className="truncate text-sm text-slate-600">
                      {a.language !== "en" && a.title_en ? a.title_en : a.title}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-400">Nothing in this period.</p>
              )}
            </Link>
          ))}
        </div>
      </section>

      {trending.length ? (
        <section className="mb-6">
          {section("Trending in the last 6 hours")}
          <div className="flex flex-wrap gap-2">
            {trending.map((t) => (
              <Link
                key={t.phrase}
                href={`/browse${toQuery({ q: t.phrase, mode: "phrase", fields: "title", range: "24h" })}`}
                className="rounded-full bg-white px-3 py-1 text-sm text-slate-700 ring-1 ring-slate-200 hover:bg-brand-soft hover:text-brand"
                title={`${t.sources} outlets in 6h — ${t.lift.toFixed(1)}× the usual rate`}
              >
                {t.phrase} <span className="text-xs text-slate-400">{t.sources}</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {stories.length ? (
        <section className="mb-6">
          {section("Top stories", <Link href={`/stories${toQuery({ range: f.range, from: f.from, to: f.to })}`} className="text-xs text-brand hover:underline">All stories</Link>)}
          <div className="space-y-3">
            {stories.map((s) => (
              <StoryCard key={s.id} story={s} filters={f} />
            ))}
          </div>
        </section>
      ) : null}

      <section>
        {section(
          "Latest",
          <Link href={browseHref} className="text-xs text-brand hover:underline">
            See all {latest.total.toLocaleString()} in Browse →
          </Link>
        )}
        <Feed articles={latest.items} autoRefresh />
      </section>
    </Shell>
  );
}
