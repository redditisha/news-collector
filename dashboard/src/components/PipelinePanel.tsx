"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { PipelineStatus } from "@/lib/pipeline";
import { timeAgo } from "@/lib/utils";
import { HOSTED } from "@/lib/mode";

const POLL_MS = 3000;
const GIVE_UP_MS = 40 * 60 * 1000;

const STAGE_LABEL: Record<string, string> = {
  collecting: "Collecting feeds into the Google Sheet",
  syncing: "Copying new rows to this PC",
  translating: "Translating Indian-language headlines",
  clustering: "Grouping articles into stories",
  publishing: "Publishing translations and stories for the online dashboard",
};

/**
 * Pipeline status (collector on GitHub, manual collector runs, local sync)
 * and the "Sync now" button, which runs the whole pipeline and shows each
 * stage live until it finishes.
 */
export function PipelinePanel({ initial }: { initial: PipelineStatus }) {
  const router = useRouter();
  const [status, setStatus] = useState(initial);
  const [clickedAt, setClickedAt] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [mode, setMode] = useState<"full" | "data">("full");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  async function poll(since: number) {
    const s: PipelineStatus = await fetch("/api/sync/run", { cache: "no-store" })
      .then((r) => r.json())
      .catch(() => null);
    if (s) setStatus(s);
    const run = s?.lastSync;
    // Our run is the first one started after the click (it may first wait for
    // a scheduled run that was already going).
    // A data sync runs alongside other runs, so match it by start time only.
    const ours = run && new Date(run.started_at).getTime() >= since - 2000;
    if (ours && run.status !== "running") {
      setClickedAt(null);
      setMsg(
        run.status !== "ok"
          ? `✗ Finished with errors: ${run.error}`
          : mode === "data"
          ? `✓ Synced — ${run.new_articles} new articles and ${run.translated} translations copied from the sheet.`
          : `✓ Done — ${s.manualCollect?.new_articles ?? 0} collected, ${run.new_articles} new on this PC, ${run.translated} translated.`
      );
      router.refresh();
      return;
    }
    if (Date.now() - since > GIVE_UP_MS) {
      setClickedAt(null);
      setMsg("Still running in the background — check back later.");
      return;
    }
    timer.current = setTimeout(() => poll(since), POLL_MS);
  }

  async function syncNow(mode: "full" | "data" = "full") {
    setMsg(null);
    const since = Date.now();
    setMode(mode);
    const res = await fetch("/api/sync/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode }),
    });
    const d = await res.json().catch(() => ({}));
    if (!d.ok) return setMsg(`✗ ${d.error || "Could not start the sync."}`);
    setClickedAt(since);
    timer.current = setTimeout(() => poll(since), 1500);
  }

  const run = status.lastSync;
  const running = clickedAt !== null;
  const ourRunStarted = running && run && new Date(run.started_at).getTime() >= clickedAt! - 2000;
  const progress = !running
    ? null
    : !ourRunStarted
    ? run?.status === "running" && mode === "full"
      ? "Waiting for the background sync that's already running…"
      : "Starting…"
    : `${STAGE_LABEL[run!.stage || ""] || "Working"}${run!.detail && run!.stage === "translating" ? ` — ${run!.detail}` : ""}…`;

  const gh = status.github;
  const ghRun = gh.latest;
  const manual = status.manualCollect;

  return (
    <section className="mb-8 rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h2 className="text-sm font-semibold text-ink">Pipeline</h2>
        <a href="/admin/logs" className="text-xs text-brand hover:underline">Logs of every run →</a>
        {HOSTED ? null : (
        <>
        <button
          onClick={() => syncNow("data")}
          disabled={running}
          title="Copy new articles and the cloud translator's translations from the sheet to this PC, and publish this PC's translations and stories — no collecting or translating (seconds)"
          className="rounded-lg border border-emerald-600 px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-60"
        >
          {running && mode === "data" ? "⇅ Syncing…" : "⇅ Sync data"}
        </button>
        <button
          onClick={() => syncNow("full")}
          disabled={running}
          title="Collect all feeds into the sheet, copy new rows to this PC, then translate"
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          {running && mode === "full" ? "⟳ Running…" : "⟳ Sync now"}
        </button>
        </>
        )}
        {progress ? <span className="text-sm text-slate-600">{progress}</span> : null}
        {!progress && msg ? <span className="text-sm text-slate-600">{msg}</span> : null}
      </div>

      <dl className="grid gap-3 text-sm md:grid-cols-3">
        <Row
          label="Collector on GitHub (every 15 min)"
          tone={!ghRun ? "muted" : ghRun.conclusion === "success" || ghRun.status !== "completed" ? "ok" : "bad"}
        >
          {!gh.configured ? (
            "Not configured (COLLECTOR_REPO)"
          ) : ghRun ? (
            <>
              <span suppressHydrationWarning>{timeAgo(ghRun.at)}</span> ·{" "}
              {ghRun.status === "completed" ? ghRun.conclusion : ghRun.status.replace("_", " ")} ·{" "}
              {ghRun.event === "schedule" ? "scheduled" : "manual"}
              {gh.repoUrl ? (
                <>
                  {" "}
                  ·{" "}
                  <a href={gh.repoUrl} target="_blank" rel="noopener noreferrer" className="text-brand hover:underline">
                    runs
                  </a>
                </>
              ) : null}
            </>
          ) : (
            "No runs yet"
          )}
          {gh.error ? <div className="text-xs text-slate-400">GitHub unreachable just now: {gh.error}</div> : null}
        </Row>

        {HOSTED ? (
          <Row label="PC (translations, stories, watchlists)" tone={status.pc?.publishedAt ? "ok" : "muted"}>
            {status.pc?.publishedAt ? (
              <>
                Last published <span suppressHydrationWarning>{timeAgo(status.pc.publishedAt)}</span>
                {status.pc.untranslated ? ` · ${status.pc.untranslated.toLocaleString()} headlines waiting for translation` : ""}
                <div className="text-xs text-slate-400">Stories and translations are as of then; newer articles show untranslated until the PC is on.</div>
              </>
            ) : (
              "Not published yet"
            )}
          </Row>
        ) : (
        <>
        <Row label="Collector run from this PC (Sync now)" tone={!manual ? "muted" : manual.status === "error" ? "bad" : "ok"}>
          {manual ? (
            <>
              <span suppressHydrationWarning>{timeAgo(manual.at)}</span> · {manual.status}
              {manual.status === "ok" ? ` · ${manual.new_articles ?? 0} new` : ""}
              {manual.error ? <div className="text-xs text-red-600">{manual.error}</div> : null}
            </>
          ) : (
            "Never"
          )}
        </Row>

        <Row label="Sheet → this PC (hourly + Sync now)" tone={!run ? "muted" : run.status === "error" ? "bad" : "ok"}>
          {run ? (
            <>
              <span suppressHydrationWarning>{timeAgo(run.finished_at || run.started_at)}</span> · {run.status}
              {run.status !== "running" ? ` · +${run.new_articles} articles, ${run.translated} translated` : ""}
              {run.error ? <div className="text-xs text-red-600">{run.error}</div> : null}
            </>
          ) : (
            "Never"
          )}
        </Row>
        </>
        )}
        <Row label="Cloud translator (every 15 min, GitHub)" tone={!status.cloud.lastRunAt ? "muted" : status.cloud.status === "ok" ? "ok" : "bad"}>
          {status.cloud.lastRunAt ? (
            <>
              <span suppressHydrationWarning>{timeAgo(status.cloud.lastRunAt)}</span> · {status.cloud.status}
              {status.cloud.translated !== null ? ` · ${status.cloud.translated} translated` : ""}
              {status.cloud.pending ? ` · ${status.cloud.pending.toLocaleString()} still waiting` : ""}
              {status.cloud.url ? (
                <>
                  {" "}·{" "}
                  <a href={status.cloud.url} target="_blank" rel="noopener noreferrer" className="text-brand hover:underline">run</a>
                </>
              ) : null}
              {status.cloud.error ? <div className="text-xs text-red-600">{status.cloud.error}</div> : null}
            </>
          ) : (
            "No runs yet"
          )}
        </Row>
      </dl>
    </section>
  );
}

function Row({ label, tone, children }: { label: string; tone: "ok" | "bad" | "muted"; children: React.ReactNode }) {
  const dot = tone === "ok" ? "bg-emerald-500" : tone === "bad" ? "bg-red-500" : "bg-slate-300";
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <dt className="mb-0.5 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-400">
        <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
        {label}
      </dt>
      <dd className="text-slate-700">{children}</dd>
    </div>
  );
}
