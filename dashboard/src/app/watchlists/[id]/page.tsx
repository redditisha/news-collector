import { HOSTED } from "@/lib/mode";
import { ensureData, hostedFilters } from "@/lib/sheetdata";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Shell } from "@/components/Shell";
import { Feed } from "@/components/Feed";
import { FilterBar } from "@/components/FilterBar";
import { NgramPanel } from "@/components/NgramPanel";
import { Pagination } from "@/components/Pagination";
import { PAGE_SIZE, parseFilters, toQuery } from "@/lib/filters";
import { countRemovedFromWatchlist, fetchArticlesPage, filterOptions, getWatchlist, markWatchlistViewed, watchlistScope } from "@/lib/queries";
import { timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** A term as typed; a trailing space (whole-word match) is shown as ␣. */
const showTerm = (t: string) => (/\s$/.test(t) ? `${t.trimEnd()}␣` : t);

/**
 * One watchlist's matches, newest first, with all filters. Muted articles are
 * included: something you track should never be hidden by a mute rule.
 * Articles can be removed by hand (✕ on the card); ?removed=1 lists those,
 * with a button to put each back. Opening the page marks its matches as read.
 */
export default async function WatchlistPage({ params, searchParams }: { params: { id: string }; searchParams: Record<string, string> }) {
  await ensureData();
  const w = getWatchlist(Number(params.id));
  if (!w) notFound();
  const showRemoved = searchParams.removed === "1";
  const f = hostedFilters(parseFilters(searchParams));
  await ensureData({ filters: f });
  const scope = watchlistScope(w, showRemoved);
  const result = scope ? fetchArticlesPage(f, scope) : { items: [], total: 0, page: 1, pages: 1 };
  const removedCount = countRemovedFromWatchlist(w.id);
  const previousVisit = w.last_viewed_at;
  const fresh = previousVisit ? result.items.filter((a) => (a.synced_at ?? "") > previousVisit).length : 0;
  if (!showRemoved) markWatchlistViewed(w.id);

  const base = `/watchlists/${w.id}`;
  const extra = showRemoved ? { removed: "1" } : undefined;
  const withExtra = (qs: string) => (showRemoved ? `${qs}${qs ? "&" : "?"}removed=1` : qs);
  const paging = (
    <Pagination page={result.page} pages={result.pages} total={result.total} pageSize={PAGE_SIZE} hrefFor={(p) => base + withExtra(toQuery(f, { page: p }))} />
  );
  return (
    <Shell
      title={showRemoved ? `${w.name} — removed` : w.name}
      subtitle={
        <>
          {w.terms.split("\n").map(showTerm).join(" · ")}
          {previousVisit && !showRemoved ? (
            <span suppressHydrationWarning>
              {" "}— last opened {timeAgo(previousVisit)}
              {fresh ? `, ${fresh} new on this page` : ""}
            </span>
          ) : null}
        </>
      }
      actions={
        <div className="flex flex-wrap items-center gap-3 text-sm">
          {showRemoved ? (
            <Link href={base + toQuery(f, { page: 1 })} className="text-brand hover:underline">← Back to watchlist</Link>
          ) : removedCount ? (
            <Link href={base + withExtra("?removed=1")} className="text-slate-500 hover:underline">Removed ({removedCount})</Link>
          ) : null}
          <Link href="/watchlists" className="text-brand hover:underline">{HOSTED ? "All watchlists" : "Edit watchlists"}</Link>
        </div>
      }
    >
      <FilterBar filters={f} options={filterOptions()} extra={extra} />
      {showRemoved ? null : <NgramPanel filters={f} watchlistId={w.id} />}
      {paging}
      <Feed
        articles={result.items}
        autoRefresh={result.page === 1 && !showRemoved}
        watchlist={{ id: w.id, removed: showRemoved }}
        empty={
          showRemoved ? (
            "Nothing removed from this watchlist."
          ) : (
            <>
              No matches yet{f.q || f.range || f.from ? " for these filters" : ""}. New articles mentioning{" "}
              <b>{w.terms.split("\n")[0].trim()}</b> will show up here.
            </>
          )
        }
      />
      {paging}
    </Shell>
  );
}
