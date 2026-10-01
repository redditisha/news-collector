import { dayTabs, ensureData, hostedDailyStats, sheetHealth } from "@/lib/sheetdata";
import { HOSTED } from "@/lib/mode";
import { Shell } from "@/components/Shell";
import { AdminClient } from "@/components/AdminClient";
import { DailyChart, type DayStat } from "@/components/DailyChart";
import { PipelinePanel } from "@/components/PipelinePanel";
import { getPipelineStatus } from "@/lib/pipeline";
import fs from "fs";
import { db, dbPath } from "@/lib/db";
import { fetchCategories } from "@/lib/queries";
import { addDays, istDayStart, istToday } from "@/lib/filters";

export const dynamic = "force-dynamic";

function getStats() {
  const d = db();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const today = startOfToday.toISOString();
  const dayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const count = (sql: string, ...params: unknown[]) =>
    (d.prepare(sql).get(...params) as { n: number }).n;

  // The database file plus its write-ahead log, where recent writes live
  // until SQLite checkpoints them into the main file.
  let archiveBytes = 0;
  for (const f of [dbPath(), `${dbPath()}-wal`]) {
    try {
      archiveBytes += fs.statSync(f).size;
    } catch {}
  }

  return {
    totalSources: count("select count(*) as n from sources"),
    activeSources: count("select count(*) as n from sources where active = 1"),
    erroredSources: count("select count(*) as n from sources where last_error is not null"),
    articlesToday: count("select count(*) as n from articles where fetched_at >= ?", today),
    articlesLast24: count("select count(*) as n from articles where fetched_at >= ?", dayAgo),
    archived: count("select count(*) as n from articles"),
    untranslated: count("select count(*) as n from articles where title_en is null and language <> 'en'"),
    failedRunsToday: count("select count(*) as n from sync_runs where status = 'error' and started_at >= ?", today),
    archiveBytes,
  };
}

const IST_DAY = "date(datetime(coalesce(a.published_at, a.fetched_at), '+5 hours', '+30 minutes'))";

/** Articles per IST publish day for the last `n` days (today included), with breakdowns. */
function dailyStats(n = 15): DayStat[] {
  const d = db();
  const first = addDays(istToday(), -(n - 1));
  const since = istDayStart(first);
  const rows = (sql: string) => d.prepare(sql).all(since) as any[];
  const from = `from articles a left join sources s on s.id = a.source_id where coalesce(a.published_at, a.fetched_at) >= ?`;
  const days = new Map<string, DayStat>();
  for (let i = 0; i < n; i++) {
    const day = addDays(first, i);
    days.set(day, { day, total: 0, sources: 0, byLang: {}, byGroup: {}, topSources: [] });
  }
  for (const r of rows(`select ${IST_DAY} as day, count(*) as n, count(distinct a.source_id) as src ${from} group by day`)) {
    const s = days.get(r.day);
    if (s) (s.total = r.n), (s.sources = r.src);
  }
  for (const r of rows(`select ${IST_DAY} as day, a.language as k, count(*) as n ${from} group by day, k`)) {
    const s = days.get(r.day);
    if (s) s.byLang[r.k] = r.n;
  }
  for (const r of rows(`select ${IST_DAY} as day, coalesce(a.category_group, '') as k, count(*) as n ${from} group by day, k`)) {
    const s = days.get(r.day);
    if (s) s.byGroup[r.k || "Other"] = r.n;
  }
  for (const r of rows(
    `select day, name, n from (
       select ${IST_DAY} as day, coalesce(s.name, a.source_id) as name, count(*) as n,
              row_number() over (partition by ${IST_DAY} order by count(*) desc) as rk
       ${from} group by day, a.source_id
     ) where rk <= 5`
  )) {
    days.get(r.day)?.topSources.push({ name: r.name, n: r.n });
  }
  return [...days.values()];
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: "warn" | "ok" }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</div>
      <div
        className={`mt-1 text-2xl font-bold ${
          tone === "warn" ? "text-red-600" : tone === "ok" ? "text-emerald-600" : "text-ink"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

/** Hosted Admin: what the sheet can tell — volume, feed health, the PC's backlog. Read-only. */
async function HostedAdmin() {
  await ensureData();
  const [tabs, days, pipeline, health] = [await dayTabs(), await hostedDailyStats(15), await getPipelineStatus(), await sheetHealth()];
  const d = db();
  const count = (sql: string) => (d.prepare(sql).get() as { n: number }).n;
  const today = tabs.find((t) => t.day === istToday())?.rows ?? 0;
  const inSheet = tabs.reduce((s, t) => s + t.rows, 0);
  return (
    <Shell title="Admin" subtitle="Online view — read-only. Sources are managed in the app on the PC.">
      <section className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-5">
        <Stat label="Total sources" value={count("select count(*) as n from sources")} />
        <Stat label="Active" value={count("select count(*) as n from sources where active = 1")} tone="ok" />
        <Stat label="With errors" value={count("select count(*) as n from sources where last_error is not null")} tone={count("select count(*) as n from sources where last_error is not null") ? "warn" : undefined} />
        <Stat label="Articles today" value={today.toLocaleString()} />
        <Stat label="In the sheet" value={inSheet.toLocaleString()} />
        <Stat label="Days in the sheet" value={tabs.length} />
        <Stat label="Awaiting translation" value={pipeline.pc?.untranslated?.toLocaleString() ?? "—"} />
        {health ? (
          <>
            <Stat label="Sheet used" value={`${Math.round(health.fill * 100)}%`} tone={health.fill >= 0.7 ? "warn" : undefined} />
            <Stat label="Copied to PC" value={`${health.rows ? Math.floor((health.copied / health.rows) * 100) : 100}%`} />
          </>
        ) : null}
      </section>
      <DailyChart days={days} />
      <PipelinePanel initial={pipeline} />
    </Shell>
  );
}

export default async function AdminPage() {
  if (HOSTED) return HostedAdmin();
  const [stats, categories, pipeline] = [getStats(), await fetchCategories(), await getPipelineStatus()];

  return (
    <Shell title="Admin" subtitle="Operational control & source management">
      <section className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-5">
        <Stat label="Total sources" value={stats.totalSources} />
        <Stat label="Active" value={stats.activeSources} tone="ok" />
        <Stat label="With errors" value={stats.erroredSources} tone={stats.erroredSources ? "warn" : undefined} />
        <Stat label="Articles today" value={stats.articlesToday} />
        <Stat label="Last 24h" value={stats.articlesLast24} />
        <Stat label="Archived" value={stats.archived.toLocaleString()} />
        <Stat label="Archive size" value={`${(stats.archiveBytes / 1e6).toFixed(1)} MB`} />
        <Stat label="Awaiting translation" value={stats.untranslated.toLocaleString()} />
        <Stat label="Failed syncs today" value={stats.failedRunsToday} tone={stats.failedRunsToday ? "warn" : undefined} />
      </section>

      <DailyChart days={dailyStats(15)} />

      <PipelinePanel initial={pipeline} />

      <AdminClient categories={categories} />
    </Shell>
  );
}
