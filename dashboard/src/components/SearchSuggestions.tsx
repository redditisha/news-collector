import Link from "next/link";
import { toQuery, type Filters } from "@/lib/filters";
import { fetchArticleTexts } from "@/lib/queries";
import { relatedTerms, similarTerms } from "@/lib/ngrams";

/**
 * Under a search: spelling variants that exist in the archive (added to the
 * search with OR), terms that appear often in the results (narrow the search
 * with AND), and the variants currently included.
 */
export function SearchSuggestions({ filters, basePath }: { filters: Filters; basePath: string }) {
  if (!filters.q) return null;
  const similar = similarTerms(filters.q).filter((s) => !filters.also.includes(s.term));
  const related = relatedTerms(fetchArticleTexts(filters, {}, 400), filters.q);
  if (!similar.length && !related.length && !filters.also.length) return null;

  const chip = "rounded-full px-2.5 py-0.5 text-xs ring-1 transition";
  return (
    <div className="mb-4 space-y-1.5 text-sm">
      {filters.also.length ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-slate-500">Also matching:</span>
          {filters.also.map((t) => (
            <Link
              key={t}
              href={basePath + toQuery(filters, { also: filters.also.filter((x) => x !== t), page: 1 })}
              className={`${chip} bg-brand-soft text-brand ring-brand/30 hover:bg-red-50 hover:text-red-600`}
              title="Remove"
            >
              {t} ✕
            </Link>
          ))}
        </div>
      ) : null}
      {similar.length ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-slate-500" title="Other spellings found in your archive — click to include them">
            Similar spellings:
          </span>
          {similar.map((s) => (
            <Link
              key={s.term}
              href={basePath + toQuery(filters, { also: [...filters.also, s.term], page: 1 })}
              className={`${chip} bg-white text-slate-600 ring-slate-200 hover:bg-slate-50`}
            >
              + {s.term} <span className="text-slate-400">{s.docs}</span>
            </Link>
          ))}
        </div>
      ) : null}
      {related.length ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-slate-500" title="Words common in these results — click to narrow the search">
            Related:
          </span>
          {related.map((t) => (
            <Link
              key={t}
              href={basePath + toQuery(filters, { q: `${filters.q} ${t}`, mode: "all", page: 1 })}
              className={`${chip} bg-white text-slate-600 ring-slate-200 hover:bg-slate-50`}
            >
              {t}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
