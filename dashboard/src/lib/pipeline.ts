import { HOSTED } from "@/lib/mode";
import { getState } from "@/lib/queries";
import { db } from "@/lib/db";

/**
 * Pipeline status for the header badge and the Admin page: when the feeds
 * were last collected (GitHub's scheduled runs or a manual "Sync now" run
 * from this PC), and what the local sync/translation job is doing.
 */

export interface GithubRun {
  at: string;              // when the run finished (or started, if still running)
  status: string;          // queued | in_progress | completed
  conclusion: string | null; // success | failure | cancelled | ...
  event: string;           // schedule | workflow_dispatch
  url: string;
}

export interface LocalRun {
  id: number;
  started_at: string;
  finished_at: string | null;
  status: "running" | "ok" | "error";
  new_articles: number;
  translated: number;
  tabs_deleted: number;
  error: string | null;
  stage: string | null;
  detail: string | null;
}

export interface PipelineStatus {
  lastCollectedAt: string | null;   // latest successful collection, from either path
  lastCollectedBy: "github" | "manual" | null;
  freshness: "ok" | "stale" | "old" | "unknown";
  github: { configured: boolean; latest: GithubRun | null; lastSuccess: GithubRun | null; error: string | null; repoUrl: string | null };
  manualCollect: { at: string | null; status: string; new_articles: number | null; error: string | null } | null;
  lastSync: LocalRun | null;
  /** Hosted: what the PC last published to the sheet. */
  pc?: { publishedAt: string | null; lastOkSyncAt: string | null; untranslated: number | null };
}

const GITHUB_TTL_MS = 2 * 60 * 1000; // unauthenticated API: 60 requests/hour
const STALE_AFTER_MIN = 45;          // runs every 15 min, GitHub often late
const OLD_AFTER_MIN = 180;

type GithubCache = { at: number; data: { latest: GithubRun | null; lastSuccess: GithubRun | null; error: string | null } };
const g = globalThis as unknown as { __githubRuns?: GithubCache };

async function githubRuns(repo: string) {
  if (g.__githubRuns && Date.now() - g.__githubRuns.at < GITHUB_TTL_MS) return g.__githubRuns.data;
  let data: GithubCache["data"];
  try {
    const res = await fetch(
      `https://api.github.com/repos/${repo}/actions/workflows/collect.yml/runs?per_page=10`,
      { headers: { accept: "application/vnd.github+json", "user-agent": "news-monitor" }, cache: "no-store", signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) throw new Error(`GitHub API ${res.status}`);
    const runs: GithubRun[] = ((await res.json()).workflow_runs || []).map((r: any) => ({
      at: r.status === "completed" ? r.updated_at : r.run_started_at || r.created_at,
      status: r.status,
      conclusion: r.conclusion,
      event: r.event,
      url: r.html_url,
    }));
    data = {
      latest: runs[0] ?? null,
      lastSuccess: runs.find((r) => r.status === "completed" && r.conclusion === "success") ?? null,
      error: null,
    };
  } catch (e: any) {
    // Offline or rate-limited: keep showing the last good answer if we have one.
    data = g.__githubRuns?.data
      ? { ...g.__githubRuns.data, error: e?.message || String(e) }
      : { latest: null, lastSuccess: null, error: e?.message || String(e) };
  }
  g.__githubRuns = { at: Date.now(), data };
  return data;
}

const minutesSince = (iso: string) => (Date.now() - new Date(iso).getTime()) / 60000;

export async function getPipelineStatus(): Promise<PipelineStatus> {
  const repo = process.env.COLLECTOR_REPO || "";
  const gh = repo ? await githubRuns(repo) : { latest: null, lastSuccess: null, error: null };

  const d = db();
  const manual = d
    .prepare("select coalesce(finished_at, started_at) as at, status, new_articles, error from collector_runs order by id desc limit 1")
    .get() as PipelineStatus["manualCollect"] | undefined;
  const manualOk = d
    .prepare("select finished_at as at from collector_runs where status = 'ok' order by id desc limit 1")
    .get() as { at: string } | undefined;
  const lastSync = d
    .prepare(
      `select r.*, p.stage, p.detail from sync_runs r left join run_progress p on p.run_id = r.id
       order by r.id desc limit 1`
    )
    .get() as LocalRun | undefined;

  const candidates: { at: string; by: "github" | "manual" }[] = [];
  if (gh.lastSuccess) candidates.push({ at: gh.lastSuccess.at, by: "github" });
  if (manualOk?.at) candidates.push({ at: manualOk.at, by: "manual" });
  if (HOSTED) {
    // The collector's own run log (from the sheet) covers GitHub and PC runs.
    const logged = d
      .prepare("select coalesce(finished_at, started_at) as at, trigger from collector_log where status = 'ok' order by started_at desc limit 1")
      .get() as { at: string; trigger: string } | undefined;
    if (logged) candidates.push({ at: logged.at, by: logged.trigger === "pc" ? "manual" : "github" });
  }
  const last = candidates.sort((a, b) => b.at.localeCompare(a.at))[0] ?? null;

  let freshness: PipelineStatus["freshness"] = "unknown";
  if (last) {
    const m = minutesSince(last.at);
    freshness = m <= STALE_AFTER_MIN ? "ok" : m <= OLD_AFTER_MIN ? "stale" : "old";
  }

  return {
    lastCollectedAt: last?.at ?? null,
    lastCollectedBy: last?.by ?? null,
    freshness,
    github: {
      configured: !!repo,
      latest: gh.latest,
      lastSuccess: gh.lastSuccess,
      error: gh.error,
      repoUrl: repo ? `https://github.com/${repo}/actions/workflows/collect.yml` : null,
    },
    manualCollect: manual ?? null,
    lastSync: lastSync ?? null,
    pc: HOSTED
      ? {
          publishedAt: getState("pc:published_at"),
          lastOkSyncAt: getState("pc:last_ok_sync_at") || null,
          untranslated: getState("pc:untranslated") === null ? null : Number(getState("pc:untranslated")),
        }
      : undefined,
  };
}
