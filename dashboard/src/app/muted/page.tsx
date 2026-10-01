import { Shell } from "@/components/Shell";
import { Feed } from "@/components/Feed";
import { FilterBar } from "@/components/FilterBar";
import { MuteManager } from "@/components/MuteManager";
import { Pagination } from "@/components/Pagination";
import { PAGE_SIZE, parseFilters, toQuery } from "@/lib/filters";
import { fetchArticlesPage, filterOptions, listMuteRules } from "@/lib/queries";

export const dynamic = "force-dynamic";

/** Muted — only the articles your mute rules moved out of the other sections. */
export default async function MutedPage({ searchParams }: { searchParams: Record<string, string> }) {
  const f = parseFilters(searchParams);
  const options = filterOptions();
  const result = fetchArticlesPage(f, { muted: "only" });
  const href = (p: number) => `/muted${toQuery(f, { page: p })}`;

  return (
    <Shell title="Muted" subtitle={`${result.total.toLocaleString()} muted articles — kept, just out of the way`}>
      <MuteManager rules={listMuteRules()} sources={options.sources} categories={options.categories} />
      <FilterBar filters={f} options={options} />
      <Pagination page={result.page} pages={result.pages} total={result.total} pageSize={PAGE_SIZE} hrefFor={href} />
      <Feed articles={result.items} empty="Nothing muted for these filters." />
      <Pagination page={result.page} pages={result.pages} total={result.total} pageSize={PAGE_SIZE} hrefFor={href} />
    </Shell>
  );
}
