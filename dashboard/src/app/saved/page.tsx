import { Shell } from "@/components/Shell";
import { Feed } from "@/components/Feed";
import { FilterBar } from "@/components/FilterBar";
import { FolderBar } from "@/components/FolderBar";
import { Pagination } from "@/components/Pagination";
import { PAGE_SIZE, parseFilters, toQuery } from "@/lib/filters";
import { db } from "@/lib/db";
import { fetchArticlesPage, filterOptions, listFolders } from "@/lib/queries";

export const dynamic = "force-dynamic";

/**
 * Saved — articles kept in folders, with notes (in a specific folder).
 * Saved items always show, even if a mute rule matches them.
 */
export default async function SavedPage({ searchParams }: { searchParams: Record<string, string> }) {
  const f = parseFilters(searchParams);
  const folders = listFolders();
  const folderId = Number(searchParams.folder) || null;
  const current = folderId && folders.some((x) => x.id === folderId) ? folderId : "all";

  const allCount = (db().prepare("select count(distinct article_id) as n from saved_items").get() as { n: number }).n;
  const result =
    current === "all"
      ? fetchArticlesPage(f, { muted: "include", savedAny: true })
      : fetchArticlesPage(f, { muted: "include", folderId: current });
  const extra = current === "all" ? undefined : { folder: String(current) };
  const href = (p: number) => `/saved${toQuery(f, { page: p })}${extra ? `${toQuery(f, { page: p }) ? "&" : "?"}folder=${current}` : ""}`;

  return (
    <Shell title="Saved" subtitle="Articles you've kept. Open a folder to add notes.">
      <FolderBar folders={folders} current={current} allCount={allCount} />
      <FilterBar filters={f} options={filterOptions()} extra={extra} />
      <Pagination page={result.page} pages={result.pages} total={result.total} pageSize={PAGE_SIZE} hrefFor={href} />
      <Feed
        articles={result.items}
        folderId={current === "all" ? undefined : current}
        empty="Nothing saved here yet. Use ☆ on any article, or set a watchlist to auto-save into a folder."
      />
      <Pagination page={result.page} pages={result.pages} total={result.total} pageSize={PAGE_SIZE} hrefFor={href} />
    </Shell>
  );
}
