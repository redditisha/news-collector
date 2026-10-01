import { dayTabs, ensureData } from "@/lib/sheetdata";
import { HOSTED } from "@/lib/mode";
import Link from "next/link";
import { Shell } from "@/components/Shell";
import { DayPicker } from "@/components/DayPicker";
import { Feed } from "@/components/Feed";
import { FilterBar } from "@/components/FilterBar";
import { Pagination } from "@/components/Pagination";
import { StoryCard } from "@/components/StoryCard";
import { db } from "@/lib/db";
import { PAGE_SIZE, addDays, istDayStart, istToday, parseFilters, toQuery } from "@/lib/filters";
import { fetchArticlesPage, fetchStoriesPage, filterOptions } from "@/lib/queries";

export const dynamic = "force-dynamic";

const STRIP_DAYS = 30;

function longDate(day: string) {
  return new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" }).format(
    new Date(`${day}T12:00:00+05:30`)
  );
}

/** Articles per IST day for the last STRIP_DAYS days (muted included — it's volume). */
async function dailyCounts(today: string) {
  if (HOSTED) {
    // Hosted: the sheet's day tabs hold exactly a day's articles each.
    const map = new Map((await dayTabs()).map((t) => [t.day, t.rows]));
    return Array.from({ length: STRIP_DAYS }, (_, i) => {
      const day = addDays(today, i - (STRIP_DAYS - 1));
      return { day, n: map.get(day) ?? 0 };
    });
  }
  const since = istDayStart(addDays(today, -(STRIP_DAYS - 1)));
  const rows = db()
    .prepare(
      `select date(datetime(coalesce(published_at, fetched_at), '+5 hours', '+30 minutes')) as day, count(*) as n
       from articles where coalesce(published_at, fetched_at) >= ? group by day`
    )
    .all(since) as { day: string; n: number }[];
  const map = new Map(rows.map((r) => [r.day, r.n]));
  return Array.from({ length: STRIP_DAYS }, (_, i) => {
    const day = addDays(today, i - (STRIP_DAYS - 1));
    return { day, n: map.get(day) ?? 0 };
  });
}

/**
 * Archive — any single day: that day's top stories and every article, with
 * the usual filters. The archive is permanent, so any past day is available.
 */
export default async function ArchivePage({ searchParams }: { searchParams: Record<string, string> }) {
  const today = istToday();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.date || "") && searchParams.date <= today ? searchParams.date : today;
  const f = { ...parseFilters(searchParams), range: "", from: date, to: date };
  await ensureData({ days: [date] });
  const counts = await dailyCounts(today);
  const max = Math.max(1, ...counts.map((c) => c.n));
  const result = fetchArticlesPage(f);
  const top = f.page === 1 ? fetchStoriesPage({ ...f, q: "", also: [] }, 2, 5).items : [];
  const keep = { date };
  const href = (p: number) => {
    const qs = toQuery({ ...f, from: "", to: "" }, { page: p });
    return `/archive${qs}${qs ? "&" : "?"}date=${date}`;
  };

  return (
    <Shell title={longDate(date)} subtitle={`${result.total.toLocaleString()} articles${date === today ? " so far today" : ""}`}>
      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-3">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Link href={`/archive?date=${addDays(date, -1)}`} className="rounded-lg px-3 py-1.5 text-sm text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50">
            ← Previous day
          </Link>
          <DayPicker date={date} max={today} />
          {date < today ? (
            <Link href={`/archive?date=${addDays(date, 1)}`} className="rounded-lg px-3 py-1.5 text-sm text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50">
              Next day →
            </Link>
          ) : null}
          {date !== today ? (
            <Link href="/archive" className="text-sm text-brand hover:underline">Today</Link>
          ) : null}
        </div>
        {/* Last 30 days: bar per day, click to open */}
        <div className="flex h-16 items-end gap-0.5">
          {counts.map((c) => (
            <Link
              key={c.day}
              href={`/archive?date=${c.day}`}
              title={`${c.day}: ${c.n.toLocaleString()} articles`}
              className="group flex h-full flex-1 flex-col justify-end"
            >
              <span
                className={`block rounded-t ${c.day === date ? "bg-brand" : "bg-slate-200 group-hover:bg-slate-300"}`}
                style={{ height: `${Math.max(c.n ? 6 : 2, (c.n / max) * 100)}%` }}
              />
            </Link>
          ))}
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-slate-400">
          <span>{counts[0].day}</span>
          <span>last {STRIP_DAYS} days</span>
          <span>{today}</span>
        </div>
      </div>

      {top.length ? (
        <section className="mb-6">
          <h2 className="mb-2 text-sm font-semibold text-ink">Top stories this day</h2>
          <div className="space-y-3">
            {top.map((s) => (
              <StoryCard key={s.id} story={s} filters={f} />
            ))}
          </div>
        </section>
      ) : null}

      <h2 className="mb-2 text-sm font-semibold text-ink">All articles</h2>
      <FilterBar filters={{ ...f, from: "", to: "" }} options={filterOptions()} dates={false} extra={keep} />
      <Pagination page={result.page} pages={result.pages} total={result.total} pageSize={PAGE_SIZE} hrefFor={href} />
      <Feed articles={result.items} empty="No articles for this day and these filters." />
      <Pagination page={result.page} pages={result.pages} total={result.total} pageSize={PAGE_SIZE} hrefFor={href} />
    </Shell>
  );
}
