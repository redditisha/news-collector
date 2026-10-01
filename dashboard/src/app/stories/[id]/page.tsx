import { ensureData, hostedFilters } from "@/lib/sheetdata";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Shell } from "@/components/Shell";
import { Feed } from "@/components/Feed";
import { FilterBar } from "@/components/FilterBar";
import { NgramPanel } from "@/components/NgramPanel";
import { CoverageBar, LANGUAGE_NAMES, storyFilterQuery } from "@/components/StoryCard";
import { parseFilters } from "@/lib/filters";
import { fetchArticlesPage, fetchStory, filterOptions } from "@/lib/queries";
import type { Article } from "@/lib/types";

export const dynamic = "force-dynamic";

function istDay(iso: string) {
  return new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short" }).format(new Date(iso));
}

/**
 * One story: who covered it (by language), a timeline of its articles and
 * phrase analysis over them. The usual filters narrow the articles shown —
 * e.g. language = Kannada shows how Kannada outlets covered it.
 */
export default async function StoryPage({ params, searchParams }: { params: { id: string }; searchParams: Record<string, string> }) {
  await ensureData({ storyId: Number(params.id) });
  const story = fetchStory(Number(params.id));
  if (!story) notFound();
  // Dates default to the whole story, not a recent window.
  const f = parseFilters(searchParams, { range: "all" });
  const all = fetchArticlesPage({ range: "all" }, { storyId: story.id, muted: "include" }, 5000).items;
  const shown = fetchArticlesPage({ ...f, page: 1 }, { storyId: story.id, muted: "include" }, 5000).items;
  const narrowed = shown.length !== all.length;

  // Outlets by language (all coverage), marking the ones in the current view.
  const shownSources = new Set(shown.map((a) => a.source_id));
  const outlets = new Map<string, { name: string; lang: string; count: number }>();
  for (const a of all) {
    const cur = outlets.get(a.source_id) ?? { name: a.source?.name ?? a.source_id, lang: a.source?.language ?? a.language, count: 0 };
    cur.count++;
    outlets.set(a.source_id, cur);
  }
  const byLang = new Map<string, { id: string; name: string; count: number }[]>();
  for (const [id, o] of outlets) byLang.set(o.lang, [...(byLang.get(o.lang) ?? []), { id, name: o.name, count: o.count }]);

  // Timeline of the shown articles, oldest first, grouped by IST day.
  const days = new Map<string, Article[]>();
  for (const a of [...shown].reverse()) {
    const d = istDay(a.published_at || a.fetched_at);
    days.set(d, [...(days.get(d) ?? []), a]);
  }

  return (
    <Shell
      title={story.title}
      subtitle={`${story.source_count} outlets · ${story.article_count} articles · ${istDay(story.first_seen)} → ${istDay(story.last_seen)}`}
      actions={
        <Link href={`/stories${storyFilterQuery(f)}`} className="text-sm text-brand hover:underline">
          All stories
        </Link>
      }
    >
      <section className="mb-5 rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-ink">Coverage</h2>
          <CoverageBar storyId={story.id} />
        </div>
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {[...byLang].map(([lang, list]) => (
            <div key={lang}>
              <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">
                {LANGUAGE_NAMES[lang] ?? lang} ({list.length})
              </div>
              <ul className="space-y-0.5 text-sm">
                {list.map((o) => (
                  <li key={o.id} className={narrowed && !shownSources.has(o.id) ? "text-slate-300" : "text-slate-700"}>
                    {o.name}
                    {o.count > 1 ? <span className="text-slate-400"> ×{o.count}</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <FilterBar filters={f} options={filterOptions()} sort={false} defaultRange="all" />
      <NgramPanel filters={f} storyId={story.id} />

      <h2 className="mb-2 text-sm font-semibold text-ink">
        Timeline (oldest first){narrowed ? ` — ${shown.length} of ${all.length} articles match the filters` : ""}
      </h2>
      {shown.length ? (
        [...days].map(([day, list]) => (
          <div key={day} className="mb-5">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{day}</div>
            <Feed articles={list} />
          </div>
        ))
      ) : (
        <Feed articles={[]} empty="None of this story's articles match these filters." />
      )}
    </Shell>
  );
}
