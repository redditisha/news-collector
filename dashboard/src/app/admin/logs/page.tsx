import { ensureData } from "@/lib/sheetdata";
import { HOSTED } from "@/lib/mode";
import Link from "next/link";
import { Shell } from "@/components/Shell";
import { Pagination } from "@/components/Pagination";
import {
  collectorRuns,
  collectorTimeline,
  githubRuns,
  logFile,
  sourceNames,
  sourceStats,
  syncRuns,
  type CollectorRun,
} from "@/lib/logs";

export const dynamic = "force-dynamic";

const ALL_TABS = [
  { key: "collector", label: "Collector runs" },
  { key: "sync", label: "Sync runs" },
  { key: "sources", label: "Sources" },
  { key: "github", label: "GitHub" },
  { key: "file", label: "Log file" },
] as const;
// Sync runs and the log file live on the PC only.
const TABS = HOSTED ? ALL_TABS.filter((t) => t.key !== "sync" && t.key !== "file") : ALL_TABS;

const PAGE = 50;

const TRIGGER: Record<string, { label: string; cls: string }> = {
  "github-schedule": { label: "GitHub · scheduled", cls: "bg-emerald-50 text-emerald-700" },
  "github-manual": { label: "GitHub · manual", cls: "bg-sky-50 text-sky-700" },
  pc: { label: "This PC · Sync now", cls: "bg-violet-50 text-violet-700" },
  local: { label: "Local test", cls: "bg-slate-100 text-slate-600" },
};

function when(iso: string | null) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).format(new Date(iso));
}
const secs = (ms: number | null | undefined) => (ms == null ? "—" : ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`);
const num = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString());

function Status({ s }: { s: string | null }) {
  const cls = s === "ok" || s === "success" ? "bg-emerald-50 text-emerald-700" : s === "error" || s === "failure" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800";
  return <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${cls}`}>{s ?? "—"}</span>;
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</div>
      <div className="text-lg font-bold text-ink">{value}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function CollectorTab({ sp }: { sp: Record<string, string> }) {
  const page = Math.max(1, Number(sp.page) || 1);
  const result = collectorRuns({ page, pageSize: PAGE, trigger: sp.trigger || undefined, status: sp.status || undefined });
  const timeline = collectorTimeline(48);
  const names = sourceNames();
  const max = Math.max(1, ...timeline.map((t) => t.new_articles ?? 0));
  const day = timeline.filter((t) => Date.now() - new Date(t.started_at).getTime() < 86400_000);
  const qs = (over: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams({ tab: "collector", ...(sp.trigger ? { trigger: sp.trigger } : {}), ...(sp.status ? { status: sp.status } : {}) });
    for (const [k, v] of Object.entries(over)) v === undefined || v === "" ? p.delete(k) : p.set(k, String(v));
    return `/admin/logs?${p}`;
  };
  const chip = (on: boolean) => `rounded-full px-2.5 py-0.5 text-xs ring-1 ${on ? "bg-brand text-white ring-brand" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"}`;

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Runs (24h)" value={day.length} />
        <Stat label="Scheduled (24h)" value={day.filter((t) => t.trigger === "github-schedule").length} />
        <Stat label="New articles (24h)" value={num(day.reduce((s, t) => s + (t.new_articles ?? 0), 0))} />
        <Stat label="Failed runs (24h)" value={day.filter((t) => t.status === "error").length} />
        <Stat label="Last run" value={<span suppressHydrationWarning className="text-sm">{when(timeline[timeline.length - 1]?.started_at ?? null)}</span>} />
      </div>

      <section className="mb-5 rounded-xl border border-slate-200 bg-white p-3">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">New articles per run — last 48 hours</div>
        {timeline.length ? (
          <div className="no-scrollbar flex h-24 items-end gap-px overflow-x-auto">
            {timeline.map((t, i) => (
              <span
                key={i}
                title={`${when(t.started_at)} · ${TRIGGER[t.trigger]?.label ?? t.trigger} · ${t.new_articles ?? 0} new${t.status !== "ok" ? ` · ${t.status}` : ""}`}
                className={`min-w-[3px] flex-1 rounded-t ${t.status === "error" ? "bg-red-400" : t.trigger === "github-schedule" ? "bg-emerald-400" : t.trigger === "pc" ? "bg-violet-400" : "bg-sky-400"}`}
                style={{ height: `${Math.max(3, ((t.new_articles ?? 0) / max) * 100)}%` }}
              />
            ))}
          </div>
        ) : (
          <p className="py-4 text-sm text-slate-400">No collector runs logged in the last 48 hours yet. Runs are copied here by each sync.</p>
        )}
        <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-slate-500">
          <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-emerald-400" />GitHub scheduled</span>
          <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-sky-400" />GitHub manual</span>
          <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-violet-400" />This PC</span>
          <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-red-400" />Failed</span>
        </div>
      </section>

      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-slate-500">Trigger:</span>
        <Link href={qs({ trigger: undefined, page: undefined })} className={chip(!sp.trigger)}>All</Link>
        {Object.entries(TRIGGER).map(([k, v]) => (
          <Link key={k} href={qs({ trigger: k, page: undefined })} className={chip(sp.trigger === k)}>{v.label}</Link>
        ))}
        <span className="ml-3 text-xs text-slate-500">Status:</span>
        {["", "ok", "error", "skipped"].map((s) => (
          <Link key={s || "all"} href={qs({ status: s || undefined, page: undefined })} className={chip((sp.status || "") === s)}>{s || "All"}</Link>
        ))}
      </div>

      <Pagination page={result.page} pages={result.pages} total={result.total} pageSize={PAGE} hrefFor={(p) => qs({ page: p })} />
      <div className="space-y-2">
        {result.items.map((r) => (
          <CollectorRow key={r.run_id} r={r} names={names} />
        ))}
        {!result.items.length ? <p className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">No collector runs match.</p> : null}
      </div>
      <Pagination page={result.page} pages={result.pages} total={result.total} pageSize={PAGE} hrefFor={(p) => qs({ page: p })} />
    </>
  );
}

function CollectorRow({ r, names }: { r: CollectorRun; names: Map<string, string> }) {
  const t = TRIGGER[r.trigger ?? ""] ?? { label: r.trigger ?? "?", cls: "bg-slate-100 text-slate-600" };
  const failedFeeds = r.details.filter((d) => d.status === "error");
  return (
    <details className="group rounded-xl border border-slate-200 bg-white">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm">
        <span className="w-32 shrink-0 font-medium text-slate-700" suppressHydrationWarning>{when(r.started_at)}</span>
        <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${t.cls}`}>{t.label}</span>
        <Status s={r.status} />
        <span className="text-slate-600"><b>{num(r.new_articles)}</b> new</span>
        <span className="text-slate-500">{num(r.duplicates)} already had · {num(r.skipped_old)} too old</span>
        <span className="text-slate-500">{num((r.sources ?? 0) - (r.failed ?? 0))}/{num(r.sources)} feeds ok</span>
        <span className="text-slate-400">{secs(r.duration_ms)}</span>
        <span className="ml-auto text-xs text-slate-400 group-open:hidden">details ▾</span>
      </summary>
      <div className="border-t border-slate-100 px-4 py-3 text-sm">
        <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
          <span>Run id: {r.run_id}</span>
          <span suppressHydrationWarning>Finished: {when(r.finished_at)}</span>
          {r.tabs ? <span>Tabs written: {r.tabs.split(" ").map((x) => x.replace(":", " → ") + " rows").join(", ")}</span> : null}
          {r.url ? <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-brand hover:underline">Open on GitHub ↗</a> : null}
        </div>
        {r.error ? <p className="mb-2 rounded bg-red-50 px-2 py-1 text-xs text-red-700">{r.error}</p> : null}
        {failedFeeds.length ? (
          <p className="mb-2 text-xs text-red-600">Failed feeds: {failedFeeds.map((d) => `${names.get(d.id) ?? d.id} (${d.error})`).join("; ")}</p>
        ) : null}
        {r.details.length ? (
          <div className="max-h-96 overflow-auto rounded-lg border border-slate-100">
            <table className="min-w-full text-xs">
              <thead className="sticky top-0 bg-slate-50 text-left text-[11px] uppercase text-slate-500">
                <tr>
                  <th className="px-2 py-1.5">Feed</th>
                  <th className="px-2 py-1.5 text-right">In feed</th>
                  <th className="px-2 py-1.5 text-right">New</th>
                  <th className="px-2 py-1.5 text-right">Already had</th>
                  <th className="px-2 py-1.5 text-right">Too old</th>
                  <th className="px-2 py-1.5 text-right">Time</th>
                  <th className="px-2 py-1.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {[...r.details].sort((a, b) => b.new - a.new).map((d) => (
                  <tr key={d.id} className={d.status === "error" ? "bg-red-50/50" : ""}>
                    <td className="px-2 py-1 text-slate-700">{names.get(d.id) ?? d.id}</td>
                    <td className="px-2 py-1 text-right">{d.items}</td>
                    <td className="px-2 py-1 text-right font-semibold">{d.new || ""}</td>
                    <td className="px-2 py-1 text-right text-slate-500">{d.dup}</td>
                    <td className="px-2 py-1 text-right text-slate-500">{d.old || ""}</td>
                    <td className="px-2 py-1 text-right text-slate-400">{secs(d.ms)}</td>
                    <td className="px-2 py-1">{d.status === "ok" ? <span className="text-emerald-600">ok</span> : <span className="text-red-600">{d.error}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </details>
  );
}

// ---------------------------------------------------------------------------

function SyncTab({ sp }: { sp: Record<string, string> }) {
  const page = Math.max(1, Number(sp.page) || 1);
  const result = syncRuns({ page, pageSize: PAGE, status: sp.status || undefined });
  const href = (p: number) => `/admin/logs?tab=sync&page=${p}${sp.status ? `&status=${sp.status}` : ""}`;
  const chip = (on: boolean) => `rounded-full px-2.5 py-0.5 text-xs ring-1 ${on ? "bg-brand text-white ring-brand" : "bg-white text-slate-600 ring-slate-200"}`;
  return (
    <>
      <p className="mb-3 text-sm text-slate-500">
        Background runs on this PC: copying new rows from the sheet, translating, grouping stories — scheduled (log-on, network, hourly) or via Sync now.
      </p>
      <div className="mb-3 flex gap-1.5">
        {["", "ok", "error", "running"].map((s) => (
          <Link key={s || "all"} href={`/admin/logs?tab=sync${s ? `&status=${s}` : ""}`} className={chip((sp.status || "") === s)}>{s || "All"}</Link>
        ))}
      </div>
      <Pagination page={result.page} pages={result.pages} total={result.total} pageSize={PAGE} hrefFor={href} />
      <div className="space-y-2">
        {result.items.map((r) => {
          const dur = r.finished_at ? new Date(r.finished_at).getTime() - new Date(r.started_at).getTime() : null;
          const kind = r.events.find((e) => /started: /.test(e.message))?.message.split("started: ")[1];
          return (
            <details key={r.id} className="group rounded-xl border border-slate-200 bg-white">
              <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm">
                <span className="w-32 shrink-0 font-medium text-slate-700" suppressHydrationWarning>{when(r.started_at)}</span>
                <span className="text-xs text-slate-400">#{r.id}</span>
                {kind ? <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">{kind}</span> : null}
                <Status s={r.status} />
                <span className="text-slate-600"><b>{num(r.new_articles)}</b> new on PC</span>
                <span className="text-slate-500">{num(r.translated)} translated</span>
                {r.tabs_deleted ? <span className="text-slate-500">{r.tabs_deleted} tabs retired</span> : null}
                <span className="text-slate-400">{secs(dur)}</span>
                <span className="ml-auto text-xs text-slate-400 group-open:hidden">log ▾</span>
              </summary>
              <div className="border-t border-slate-100 px-4 py-3">
                {r.error ? <p className="mb-2 rounded bg-red-50 px-2 py-1 text-xs text-red-700">{r.error}</p> : null}
                {r.events.length ? (
                  <ol className="space-y-0.5 font-mono text-xs">
                    {r.events.map((e, i) => (
                      <li key={i} className={`whitespace-pre-wrap ${e.level === "ERROR" ? "text-red-600" : e.level === "WARNING" ? "text-amber-700" : "text-slate-600"}`}>
                        <span className="text-slate-400" suppressHydrationWarning>{when(e.at).split(", ")[1] ?? when(e.at)}</span>{" "}
                        <span className="text-slate-400">[{e.logger}]</span> {e.message}
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="text-xs text-slate-400">No step log for this run (runs before step logging was added, or it's still starting).</p>
                )}
              </div>
            </details>
          );
        })}
      </div>
      <Pagination page={result.page} pages={result.pages} total={result.total} pageSize={PAGE} hrefFor={href} />
    </>
  );
}

// ---------------------------------------------------------------------------

function SourcesTab({ sp }: { sp: Record<string, string> }) {
  const hours = sp.period === "7d" ? 168 : sp.period === "30d" ? 720 : 24;
  const stats = sourceStats(hours);
  const chip = (on: boolean) => `rounded-full px-2.5 py-0.5 text-xs ring-1 ${on ? "bg-brand text-white ring-brand" : "bg-white text-slate-600 ring-slate-200"}`;
  return (
    <>
      <div className="mb-3 flex items-center gap-1.5">
        <span className="text-xs text-slate-500">Period:</span>
        {[["24h", "24 hours"], ["7d", "7 days"], ["30d", "30 days"]].map(([k, l]) => (
          <Link key={k} href={`/admin/logs?tab=sources&period=${k}`} className={chip((sp.period || "24h") === k)}>{l}</Link>
        ))}
      </div>
      {stats.length ? (
        <div className="overflow-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Feed</th>
                <th className="px-3 py-2 text-right">Runs</th>
                <th className="px-3 py-2 text-right">Failed</th>
                <th className="px-3 py-2 text-right">New articles</th>
                <th className="px-3 py-2 text-right">Avg in feed</th>
                <th className="px-3 py-2 text-right">Already had</th>
                <th className="px-3 py-2 text-right">Too old</th>
                <th className="px-3 py-2 text-right">Avg fetch</th>
                <th className="px-3 py-2">Last error</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {stats.map((s) => (
                <tr key={s.id} className={s.failed ? "bg-red-50/40" : ""}>
                  <td className="px-3 py-1.5 font-medium text-slate-700">{s.name}</td>
                  <td className="px-3 py-1.5 text-right">{s.runs}</td>
                  <td className={`px-3 py-1.5 text-right ${s.failed ? "font-semibold text-red-600" : "text-slate-400"}`}>{s.failed}</td>
                  <td className="px-3 py-1.5 text-right font-semibold">{s.newTotal}</td>
                  <td className="px-3 py-1.5 text-right text-slate-500">{s.avgItems}</td>
                  <td className="px-3 py-1.5 text-right text-slate-500">{s.dupTotal}</td>
                  <td className="px-3 py-1.5 text-right text-slate-500">{s.oldTotal}</td>
                  <td className="px-3 py-1.5 text-right text-slate-400">{secs(s.avgMs)}</td>
                  <td className="max-w-[16rem] truncate px-3 py-1.5 text-xs text-red-600" title={s.lastError ?? ""}>
                    {s.lastError ? <><span suppressHydrationWarning>{when(s.lastErrorAt)}</span>: {s.lastError}</> : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">No collector runs logged in this period yet.</p>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------

async function GithubTab() {
  const { repo, runs, error } = await githubRuns();
  return (
    <>
      <p className="mb-3 text-sm text-slate-500">
        Straight from GitHub ({repo || "no repo set"}) — includes runs that failed before they could write a log (e.g. missing secrets).
        {repo ? (
          <>
            {" "}
            <a href={`https://github.com/${repo}/actions/workflows/collect.yml`} target="_blank" rel="noopener noreferrer" className="text-brand hover:underline">
              Open on GitHub ↗
            </a>
          </>
        ) : null}
      </p>
      {error ? <p className="mb-3 rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">GitHub unreachable: {error}</p> : null}
      <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Runs listed" value={runs.length} />
        <Stat label="Scheduled" value={runs.filter((r) => r.event === "schedule").length} />
        <Stat label="Manual" value={runs.filter((r) => r.event === "workflow_dispatch").length} />
        <Stat label="Failed" value={runs.filter((r) => r.conclusion && r.conclusion !== "success").length} />
      </div>
      <div className="overflow-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Queued</th>
              <th className="px-3 py-2">Started</th>
              <th className="px-3 py-2">Trigger</th>
              <th className="px-3 py-2">Result</th>
              <th className="px-3 py-2 text-right">Duration</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {runs.map((r) => {
              const dur = r.started_at && r.status === "completed" ? new Date(r.updated_at).getTime() - new Date(r.started_at).getTime() : null;
              return (
                <tr key={`${r.id}-${r.attempt}`}>
                  <td className="px-3 py-1.5" suppressHydrationWarning>{when(r.created_at)}</td>
                  <td className="px-3 py-1.5 text-slate-500" suppressHydrationWarning>{when(r.started_at)}</td>
                  <td className="px-3 py-1.5">{r.event === "schedule" ? "Scheduled" : r.event === "workflow_dispatch" ? "Manual" : r.event}</td>
                  <td className="px-3 py-1.5"><Status s={r.status === "completed" ? r.conclusion : r.status} /></td>
                  <td className="px-3 py-1.5 text-right text-slate-500">{secs(dur)}</td>
                  <td className="px-3 py-1.5 text-right">
                    <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-xs text-brand hover:underline">logs ↗</a>
                  </td>
                </tr>
              );
            })}
            {!runs.length ? (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-400">No runs yet.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------

function FileTab({ sp }: { sp: Record<string, string> }) {
  const limit = Math.min(5000, Math.max(100, Number(sp.limit) || 500));
  const { lines, files } = logFile({ q: sp.q, level: sp.level, limit });
  const chip = (on: boolean) => `rounded-full px-2.5 py-0.5 text-xs ring-1 ${on ? "bg-brand text-white ring-brand" : "bg-white text-slate-600 ring-slate-200"}`;
  const base = (over: Record<string, string>) => {
    const p = new URLSearchParams({ tab: "file", ...(sp.q ? { q: sp.q } : {}), ...(sp.level ? { level: sp.level } : {}), ...over });
    for (const [k, v] of [...p]) if (!v) p.delete(k);
    return `/admin/logs?${p}`;
  };
  return (
    <>
      <form action="/admin/logs" className="mb-3 flex flex-wrap items-center gap-2">
        <input type="hidden" name="tab" value="file" />
        {sp.level ? <input type="hidden" name="level" value={sp.level} /> : null}
        <input name="q" defaultValue={sp.q} placeholder="Search the log…" className="min-w-[16rem] flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-brand" />
        <button className="rounded-lg bg-brand px-4 py-1.5 text-sm font-semibold text-white">Search</button>
      </form>
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {[["", "All"], ["problems", "Warnings + errors"], ["ERROR", "Errors"], ["INFO", "Info"]].map(([k, l]) => (
          <Link key={k || "all"} href={base({ level: k })} className={chip((sp.level || "") === k)}>{l}</Link>
        ))}
        <span className="ml-auto text-xs text-slate-400">
          Newest first · {lines.length} line(s) · {files.join(", ") || "no log file yet"}
        </span>
      </div>
      <div className="max-h-[70vh] overflow-auto rounded-xl border border-slate-200 bg-slate-950 p-3 font-mono text-xs leading-relaxed">
        {lines.map((l, i) => (
          <div key={i} className={`whitespace-pre-wrap ${l.level === "ERROR" || l.level === "CRITICAL" ? "text-red-400" : l.level === "WARNING" ? "text-amber-300" : "text-slate-300"}`}>
            <span className="text-slate-500">{l.at}</span> <span className="text-sky-300">{l.logger}</span> {l.level !== "INFO" ? <b>{l.level} </b> : null}
            {l.message}
          </div>
        ))}
        {!lines.length ? <div className="text-slate-500">No matching lines.</div> : null}
      </div>
      {lines.length >= limit ? (
        <div className="mt-2 text-center">
          <Link href={base({ limit: String(limit + 1000) })} className="text-sm text-brand hover:underline">Show more</Link>
        </div>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------

/** Admin → Logs: every run and every log line the system keeps. */
export default async function LogsPage({ searchParams }: { searchParams: Record<string, string> }) {
  await ensureData();
  const tab = TABS.some((t) => t.key === searchParams.tab) ? searchParams.tab : "collector";
  return (
    <Shell
      title="Logs"
      subtitle="Every collector run, every sync, per-feed results and the raw log"
      actions={<Link href="/admin" className="text-sm text-brand hover:underline">← Admin</Link>}
    >
      <div className="mb-4 flex flex-wrap gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.key === "collector" ? "/admin/logs" : `/admin/logs?tab=${t.key}`}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${tab === t.key ? "border-brand font-semibold text-brand" : "border-transparent text-slate-500 hover:text-slate-800"}`}
          >
            {t.label}
          </Link>
        ))}
      </div>
      {tab === "collector" ? <CollectorTab sp={searchParams} /> : null}
      {tab === "sync" ? <SyncTab sp={searchParams} /> : null}
      {tab === "sources" ? <SourcesTab sp={searchParams} /> : null}
      {tab === "github" ? await GithubTab() : null}
      {tab === "file" ? <FileTab sp={searchParams} /> : null}
    </Shell>
  );
}
