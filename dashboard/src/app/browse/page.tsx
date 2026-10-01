import { ensureData, hostedFilters } from "@/lib/sheetdata";
import { Shell } from "@/components/Shell";
import { Feed } from "@/components/Feed";
import { FilterBar } from "@/components/FilterBar";
import { NgramPanel } from "@/components/NgramPanel";
import { Pagination } from "@/components/Pagination";
import { SearchSuggestions } from "@/components/SearchSuggestions";
import { PAGE_SIZE, hasAnyFilter, parseFilters, toQuery } from "@/lib/filters";
import { fetchArticlesPage, filterOptions } from "@/lib/queries";

export const dynamic = "force-dynamic";

/**
 * Browse — the whole archive with every filter: search, dates, group, topic,
 * sources, language; newest published or newest collected ("raw") first;
 * phrase analysis over the current selection. Muted articles are excluded.
 */
export default async function BrowsePage({ searchParams }: { searchParams: Record<string, string> }) {
  const f = hostedFilters(parseFilters(searchParams));
  await ensureData({ filters: f });
  const result = fetchArticlesPage(f);
  const paging = (
    <Pagination page={result.page} pages={result.pages} total={result.total} pageSize={PAGE_SIZE} hrefFor={(p) => `/browse${toQuery(f, { page: p })}`} />
  );

  return (
    <Shell
      title="Browse"
      subtitle={hasAnyFilter(f) ? `${result.total.toLocaleString()} matching articles` : "Every article in your archive"}
    >
      <FilterBar filters={f} options={filterOptions()} />
      <SearchSuggestions filters={f} basePath="/browse" />
      <NgramPanel filters={f} />
      {paging}
      <Feed articles={result.items} autoRefresh={result.page === 1 && !f.to} />
      {paging}
    </Shell>
  );
}
