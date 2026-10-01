import Link from "next/link";
import type { Story } from "@/lib/types";
import { timeAgo } from "@/lib/utils";
import { db } from "@/lib/db";
import { articleWhere, storyLanguages } from "@/lib/queries";
import { toQuery, type Filters } from "@/lib/filters";

export const LANGUAGE_NAMES: Record<string, string> = {
  en: "English", kn: "Kannada", hi: "Hindi", ta: "Tamil", te: "Telugu", gu: "Gujarati", mr: "Marathi", ml: "Malayalam", bn: "Bengali",
};
const LANGUAGE_COLOURS: Record<string, string> = {
  en: "bg-sky-500", kn: "bg-orange-400", hi: "bg-rose-400", ta: "bg-emerald-500", te: "bg-violet-400",
};

/** Outlets per language as a bar (all of the story's coverage). */
export function CoverageBar({ storyId }: { storyId: number }) {
  const langs = storyLanguages(storyId);
  const total = Math.max(1, langs.reduce((s, l) => s + l.sources, 0));
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-1.5 w-28 overflow-hidden rounded-full bg-slate-100">
        {langs.map((l) => (
          <span
            key={l.language}
            className={LANGUAGE_COLOURS[l.language] ?? "bg-slate-400"}
            style={{ width: `${(l.sources / total) * 100}%` }}
            title={`${l.sources} ${LANGUAGE_NAMES[l.language] ?? l.language} outlet(s)`}
          />
        ))}
      </div>
      <span className="text-xs text-slate-500">
        {langs.map((l) => `${l.sources} ${LANGUAGE_NAMES[l.language] ?? l.language}`).join(" · ")}
      </span>
    </div>
  );
}

/** The filters a story view carries into the story page (language, group, sources, topic). */
export function storyFilterQuery(f: Partial<Filters>) {
  return toQuery({ lang: f.lang, group: f.group, src: f.src, cat: f.cat });
}

/**
 * A story: headline, coverage, time span and a few member headlines. With
 * filters, the member headlines (and the counts, set by the query) are the
 * matching outlets' only.
 */
export function StoryCard({ story, filters = {} }: { story: Story; filters?: Partial<Filters> }) {
  const narrowed = !!(filters.lang || filters.group || filters.src?.length || filters.cat);
  const { sql, params } = articleWhere(
    { lang: filters.lang, group: filters.group, src: filters.src, cat: filters.cat },
    { storyId: story.id, muted: "include" }
  );
  const members = db()
    .prepare(
      `select case when a.language = 'en' then a.title else coalesce(a.title_en, a.title) end as title, s.name as source
       from articles a left join sources s on s.id = a.source_id
       ${sql} order by coalesce(a.published_at, a.fetched_at) desc limit 3`
    )
    .all(...params) as { title: string; source: string }[];
  const showTotal = narrowed && story.total_sources && story.total_sources !== story.source_count;

  return (
    <Link href={`/stories/${story.id}${storyFilterQuery(filters)}`} className="block rounded-xl border border-slate-200 bg-white p-4 transition hover:border-brand">
      <div className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
        <span className="rounded bg-amber-50 px-1.5 py-0.5 font-semibold text-amber-800">
          {story.source_count} outlets{showTotal ? ` of ${story.total_sources}` : ""}
        </span>
        <span>{story.article_count} articles</span>
        <span suppressHydrationWarning>updated {timeAgo(story.last_seen)}</span>
        {story.avg_published ? (
          <span suppressHydrationWarning title={`Average publish time of its articles: ${new Date(story.avg_published).toLocaleString()}`}>
            avg age {timeAgo(story.avg_published).replace(" ago", "")}
          </span>
        ) : null}
        <CoverageBar storyId={story.id} />
      </div>
      <h3 className="font-semibold leading-snug text-ink">{story.title}</h3>
      <ul className="mt-1.5 space-y-0.5">
        {members.map((m, i) => (
          <li key={i} className="truncate text-sm text-slate-500">
            <span className="font-medium text-slate-600">{m.source}:</span> {m.title}
          </li>
        ))}
      </ul>
    </Link>
  );
}
