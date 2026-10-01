import { ensureData, hostedFilters } from "@/lib/sheetdata";
import Link from "next/link";
import { Shell } from "@/components/Shell";
import { FilterBar } from "@/components/FilterBar";
import { Pagination } from "@/components/Pagination";
import { LANGUAGE_NAMES, StoryCard } from "@/components/StoryCard";
import { parseFilters, toQuery } from "@/lib/filters";
import { fetchStoriesPage, filterOptions, type StorySort } from "@/lib/queries";

export const dynamic = "force-dynamic";

const PAGE = 30;
const MIN_SOURCE_OPTIONS = [2, 3, 5, 8];
const SORTS: { key: StorySort; label: string; hint: string }[] = [
  { key: "coverage", label: "Most covered", hint: "Most outlets first" },
  { key: "recent", label: "Latest activity", hint: "Most recent article first" },
  { key: "avg_newest", label: "Newest (avg age)", hint: "Average publish time of the story's articles, newest first" },
  { key: "avg_oldest", label: "Oldest (avg age)", hint: "Average publish time of the story's articles, oldest first" },
];

/**
 * Stories — articles about the same event grouped across outlets and
 * languages, ranked by how many outlets cover them. Filters apply to the
 * member articles (e.g. "last 24h" = stories with coverage in the last 24h).
 */
export default async function StoriesPage({ searchParams }: { searchParams: Record<string, string> }) {
  const f = hostedFilters(parseFilters(searchParams, { range: "24h" }));
  await ensureData({ filters: f });
  const min = MIN_SOURCE_OPTIONS.includes(Number(searchParams.min)) ? Number(searchParams.min) : 2;
  const by: StorySort = SORTS.some((x) => x.key === searchParams.by) ? (searchParams.by as StorySort) : "coverage";
  const only = !!f.lang && searchParams.only === "1";
  const result = fetchStoriesPage(f, min, PAGE, by, only);
  // Page-specific params (min outlets, sort, only-this-language) ride along with the shared filters.
  const extra = (m: number, b: StorySort, o: boolean) => ({
    ...(m !== 2 ? { min: String(m) } : {}),
    ...(b !== "coverage" ? { by: b } : {}),
    ...(o ? { only: "1" } : {}),
  });
  const href = (over: { page?: number; min?: number; by?: StorySort; only?: boolean }) => {
    const qs = toQuery(f, { page: over.page ?? 1 });
    const more = new URLSearchParams(extra(over.min ?? min, over.by ?? by, over.only ?? only)).toString();
    return `/stories${qs}${more ? `${qs ? "&" : "?"}${more}` : ""}`;
  };
  const langName = LANGUAGE_NAMES[f.lang] ?? f.lang;

  return (
    <Shell title="Stories" subtitle="The same event, grouped across outlets and languages — most widely covered first">
      <FilterBar filters={f} options={filterOptions()} sort={false} defaultRange="24h" extra={Object.keys(extra(min, by, only)).length ? extra(min, by, only) : undefined} />
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-slate-600">
        Sort
        {SORTS.map((x) => (
          <Link
            key={x.key}
            href={href({ by: x.key })}
            title={x.hint}
            className={`rounded-md px-2 py-0.5 ${x.key === by ? "bg-brand text-white" : "bg-white ring-1 ring-slate-200 hover:bg-slate-50"}`}
          >
            {x.label}
          </Link>
        ))}
      </div>
      <div className="mb-3 flex items-center gap-2 text-sm text-slate-600">
        Covered by at least
        {MIN_SOURCE_OPTIONS.map((m) => (
          <Link
            key={m}
            href={href({ min: m })}
            className={`rounded-md px-2 py-0.5 ${m === min ? "bg-brand text-white" : "bg-white ring-1 ring-slate-200 hover:bg-slate-50"}`}
          >
            {m}
          </Link>
        ))}
        outlets
        {f.lang ? (
          <>
            <span className="mx-2 text-slate-300">|</span>
            <Link
              href={href({ only: !only })}
              title={`Only stories that no outlet in another language covered`}
              className={`rounded-md px-2 py-0.5 ${only ? "bg-brand text-white" : "bg-white ring-1 ring-slate-200 hover:bg-slate-50"}`}
            >
              {only ? "✓ " : ""}Only in {langName}
            </Link>
          </>
        ) : null}
      </div>
      {f.lang || f.group || f.src.length ? (
        <p className="mb-3 text-xs text-slate-500">
          Stories as {f.lang ? `${langName} outlets` : f.group ? `${f.group} outlets` : "the selected outlets"} covered them — counts,
          headlines and articles from those outlets only{only ? `, and covered in no other language` : ""}.
        </p>
      ) : null}
      <Pagination page={result.page} pages={result.pages} total={result.total} pageSize={PAGE} hrefFor={(p) => href({ page: p })} />
      {result.items.length ? (
        <div className="space-y-3">
          {result.items.map((s) => (
            <StoryCard key={s.id} story={s} filters={f} />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
          No stories for these filters. Stories are grouped in the background after each sync; try a longer time range.
        </div>
      )}
      <Pagination page={result.page} pages={result.pages} total={result.total} pageSize={PAGE} hrefFor={(p) => href({ page: p })} />
    </Shell>
  );
}
