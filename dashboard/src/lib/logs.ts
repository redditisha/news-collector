import fs from "fs";
import path from "path";
import { db, dbPath } from "@/lib/db";

/** Data for the Admin → Logs page. */

export interface SourceDetail {
  id: string;
  status: "ok" | "error";
  items: number;
  new: number;
  dup: number;
  old: number;
  ms: number;
  error?: string;
}

export interface CollectorRun {
  run_id: string;
  started_at: string;
  finished_at: string | null;
  trigger: string | null;
  status: string | null;
  duration_ms: number | null;
  sources: number | null;
  failed: number | null;
  new_articles: number | null;
  duplicates: number | null;
  skipped_old: number | null;
  tabs: string | null;
  details: SourceDetail[];
  url: string | null;
  error: string | null;
}

function parseRun(r: any): CollectorRun {
  let details: SourceDetail[] = [];
  try {
    details = r.details ? JSON.parse(r.details) : [];
  } catch {}
  return { ...r, details };
}

export function collectorRuns(opts: { page: number; pageSize: number; trigger?: string; status?: string }) {
  const where: string[] = [];
  const params: unknown[] = [];
  if (opts.trigger) (where.push("trigger = ?"), params.push(opts.trigger));
  if (opts.status) (where.push("status = ?"), params.push(opts.status));
  const w = where.length ? `where ${where.join(" and ")}` : "";
  const total = (db().prepare(`select count(*) as n from collector_log ${w}`).get(...params) as { n: number }).n;
  const pages = Math.max(1, Math.ceil(total / opts.pageSize));
  const page = Math.min(opts.page, pages);
  const items = db()
    .prepare(`select * from collector_log ${w} order by started_at desc limit ? offset ?`)
    .all(...params, opts.pageSize, (page - 1) * opts.pageSize)
    .map(parseRun);
  return { items, total, page, pages };
}

/** New articles per collector run over the last `hours`, oldest first (chart). */
export function collectorTimeline(hours: number) {
  const since = new Date(Date.now() - hours * 3600_000).toISOString();
  return db()
    .prepare("select started_at, trigger, status, new_articles, failed from collector_log where started_at >= ? order by started_at")
    .all(since) as { started_at: string; trigger: string; status: string; new_articles: number | null; failed: number | null }[];
}

export function sourceNames(): Map<string, string> {
  return new Map((db().prepare("select id, name from sources").all() as { id: string; name: string }[]).map((s) => [s.id, s.name]));
}

export interface SourceStats {
  id: string;
  name: string;
  runs: number;
  ok: number;
  failed: number;
  avgItems: number;
  newTotal: number;
  dupTotal: number;
  oldTotal: number;
  avgMs: number;
  lastError: string | null;
  lastErrorAt: string | null;
  lastOkAt: string | null;
}

/** Per-source reliability and volume over the collector runs since `hours` ago. */
export function sourceStats(hours: number): SourceStats[] {
  const since = new Date(Date.now() - hours * 3600_000).toISOString();
  const names = sourceNames();
  const acc = new Map<string, SourceStats & { itemSum: number; msSum: number }>();
  const runs = db().prepare("select started_at, details from collector_log where started_at >= ? order by started_at").all(since) as {
    started_at: string;
    details: string | null;
  }[];
  for (const r of runs) {
    for (const d of parseRun(r).details) {
      let s = acc.get(d.id);
      if (!s) {
        s = {
          id: d.id, name: names.get(d.id) ?? d.id, runs: 0, ok: 0, failed: 0, avgItems: 0, newTotal: 0, dupTotal: 0,
          oldTotal: 0, avgMs: 0, lastError: null, lastErrorAt: null, lastOkAt: null, itemSum: 0, msSum: 0,
        };
        acc.set(d.id, s);
      }
      s.runs++;
      s.msSum += d.ms || 0;
      if (d.status === "ok") {
        s.ok++;
        s.itemSum += d.items;
        s.newTotal += d.new;
        s.dupTotal += d.dup;
        s.oldTotal += d.old;
        s.lastOkAt = r.started_at;
      } else {
        s.failed++;
        s.lastError = d.error ?? "error";
        s.lastErrorAt = r.started_at;
      }
    }
  }
  return [...acc.values()]
    .map(({ itemSum, msSum, ...s }) => ({ ...s, avgItems: s.ok ? Math.round(itemSum / s.ok) : 0, avgMs: s.runs ? Math.round(msSum / s.runs) : 0 }))
    .sort((a, b) => b.failed - a.failed || b.newTotal - a.newTotal);
}

export interface SyncRun {
  id: number;
  started_at: string;
  finished_at: string | null;
  status: string;
  new_articles: number;
  translated: number;
  tabs_deleted: number;
  error: string | null;
  events: { at: string; level: string; logger: string | null; message: string }[];
}

export function syncRuns(opts: { page: number; pageSize: number; status?: string }) {
  const w = opts.status ? "where status = ?" : "";
  const params = opts.status ? [opts.status] : [];
  const total = (db().prepare(`select count(*) as n from sync_runs ${w}`).get(...params) as { n: number }).n;
  const pages = Math.max(1, Math.ceil(total / opts.pageSize));
  const page = Math.min(opts.page, pages);
  const runs = db()
    .prepare(`select * from sync_runs ${w} order by id desc limit ? offset ?`)
    .all(...params, opts.pageSize, (page - 1) * opts.pageSize) as Omit<SyncRun, "events">[];
  const ev = db().prepare("select at, level, logger, message from run_events where run_id = ? order by id");
  return { items: runs.map((r) => ({ ...r, events: ev.all(r.id) as SyncRun["events"] })), total, page, pages };
}

export interface GithubRunRow {
  id: number;
  created_at: string;
  started_at: string | null;
  updated_at: string;
  event: string;
  status: string;
  conclusion: string | null;
  url: string;
  attempt: number;
}

const g = globalThis as unknown as { __ghLog?: { at: number; repo: string; data: { runs: GithubRunRow[]; error: string | null } } };

/** Recent runs of the collector workflow straight from GitHub (cached 2 min). */
export async function githubRuns(): Promise<{ repo: string; runs: GithubRunRow[]; error: string | null }> {
  const repo = process.env.COLLECTOR_REPO || "";
  if (!repo) return { repo, runs: [], error: "COLLECTOR_REPO is not set" };
  if (g.__ghLog && g.__ghLog.repo === repo && Date.now() - g.__ghLog.at < 120_000) return { repo, ...g.__ghLog.data };
  let data: { runs: GithubRunRow[]; error: string | null };
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/collect.yml/runs?per_page=50`, {
      headers: { accept: "application/vnd.github+json", "user-agent": "news-monitor" },
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`GitHub API ${res.status}`);
    const runs = ((await res.json()).workflow_runs || []).map((r: any) => ({
      id: r.id,
      created_at: r.created_at,
      started_at: r.run_started_at,
      updated_at: r.updated_at,
      event: r.event,
      status: r.status,
      conclusion: r.conclusion,
      url: r.html_url,
      attempt: r.run_attempt,
    }));
    data = { runs, error: null };
  } catch (e: any) {
    data = { runs: g.__ghLog?.data.runs ?? [], error: e?.message || String(e) };
  }
  g.__ghLog = { at: Date.now(), repo, data };
  return { repo, ...data };
}

export interface LogLine {
  at: string;
  logger: string;
  level: string;
  message: string;
}

/**
 * The background job's log file (data/logs/local-jobs.log, plus rotated
 * copies), newest first, parsed into lines. Continuation lines (tracebacks)
 * stay with the line they belong to.
 */
export function logFile(opts: { q?: string; level?: string; limit: number }): { lines: LogLine[]; files: string[] } {
  const dir = path.join(path.dirname(dbPath()), "logs");
  const files = ["local-jobs.log", "local-jobs.log.1", "local-jobs.log.2"].map((f) => path.join(dir, f)).filter((f) => fs.existsSync(f));
  const out: LogLine[] = [];
  const LINE = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}),\d+ (\S+) (DEBUG|INFO|WARNING|ERROR|CRITICAL) (.*)$/;
  for (const file of files) {
    const parsed: LogLine[] = [];
    for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      const m = raw.match(LINE);
      if (m) parsed.push({ at: m[1], logger: m[2], level: m[3], message: m[4] });
      else if (raw.trim() && parsed.length) parsed[parsed.length - 1].message += "\n" + raw;
    }
    out.push(...parsed.reverse());
    if (out.length > 20000) break;
  }
  const q = opts.q?.toLowerCase();
  const lines = out.filter(
    (l) =>
      (!opts.level || (opts.level === "problems" ? l.level === "WARNING" || l.level === "ERROR" || l.level === "CRITICAL" : l.level === opts.level)) &&
      (!q || l.message.toLowerCase().includes(q) || l.logger.toLowerCase().includes(q))
  );
  return { lines: lines.slice(0, opts.limit), files: files.map((f) => path.basename(f)) };
}
