import { ensureData, hostedFilters } from "@/lib/sheetdata";
import { Shell } from "@/components/Shell";
import { Feed } from "@/components/Feed";
import { FilterBar } from "@/components/FilterBar";
import { Pagination } from "@/components/Pagination";
import { PAGE_SIZE, parseFilters, toQuery } from "@/lib/filters";
import { fetchArticlesPage, filterOptions } from "@/lib/queries";
import type { Article } from "@/lib/types";

export const dynamic = "force-dynamic";

function istDay(iso: string) {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(iso));
}

/** Consecutive articles grouped under the IST day they belong to (keeps the order). */
function byDay(articles: Article[], field: "published" | "fetched") {
  const groups: { day: string; items: Article[] }[] = [];
  for (const a of articles) {
    const day = istDay(field === "fetched" ? a.fetched_at : a.published_at || a.fetched_at);
    const last = groups[groups.length - 1];
    if (last?.day === day) last.items.push(a);
    else groups.push({ day, items: [a] });
  }
  return groups;
}

/**
 * Raw data — every article in the archive, in sequence, nothing hidden:
 * muted articles are included and marked. Oldest or newest first, by publish
 * or collection time, with day headings.
 */
export default async function RawDataPage({ searchParams }: { searchParams: Record<string, string> }) {
  const f = hostedFilters(parseFilters(searchParams));
  await ensureData({ filters: f });
  const result = fetchArticlesPage(f, { muted: "include" });
  const href = (p: number) => `/data${toQuery(f, { page: p })}`;
  const startNo = (result.page - 1) * PAGE_SIZE;

  return (
    <Shell
      title="Raw data"
      subtitle={`Every article in order — ${result.total.toLocaleString()} total, nothing hidden (muted ones are marked)`}
      actions={
        <a href={`/api/export${toQuery(f, { page: 1 })}`} className="text-sm text-slate-500 hover:text-slate-800" title="Download these articles with every field">
          ⬇ Export CSV
        </a>
      }
    >
      <FilterBar filters={f} options={filterOptions()} />
      <Pagination page={result.page} pages={result.pages} total={result.total} pageSize={PAGE_SIZE} hrefFor={href} />
      {result.items.length ? (
        byDay(result.items, f.sort).map((g, i) => (
          <section key={`${g.day}-${i}`} className="mb-6">
            <h2 className="sticky top-0 z-10 mb-2 bg-slate-50/95 py-1.5 text-sm font-semibold text-ink backdrop-blur">
              {g.day} <span className="font-normal text-slate-400">· {g.items.length} on this page</span>
            </h2>
            <Feed articles={g.items} />
          </section>
        ))
      ) : (
        <Feed articles={[]} />
      )}
      <Pagination page={result.page} pages={result.pages} total={result.total} pageSize={PAGE_SIZE} hrefFor={href} />
      <p className="mt-2 text-center text-xs text-slate-400">
        Articles {(startNo + 1).toLocaleString()}–{(startNo + result.items.length).toLocaleString()} of {result.total.toLocaleString()}
      </p>
    </Shell>
  );
}
