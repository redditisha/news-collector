// One collection run: fetch every active feed listed in the sheet's _sources
// tab, skip articles already in the sheet, append the rest to the tab for
// their publish date (IST), and rewrite _health.
//
// The repo is public, so this logs counts and opaque source ids only — never
// titles, URLs, feed addresses or the sheet id.
//
// Env: SHEET_ID, GOOGLE_SERVICE_ACCOUNT_JSON

import { openSpreadsheet } from "./sheets.mjs";
import { fetchFeed, normalizeItem } from "./feeds.mjs";
import {
  ARTICLE_COLUMNS, HEALTH_COLUMNS, HEALTH_TAB, RUN_COLUMNS, RUNS_TAB, SOURCE_COLUMNS,
  SOURCES_TAB, istDate,
} from "./layout.mjs";

const DAY = 86_400_000;
// Articles published longer ago than this are backlog from feeds with long
// windows (e.g. Gadgets 360 keeps ~46 days); they are skipped so they don't
// resurface once their tab ages out of the duplicate-check window below.
const MAX_AGE_DAYS = 7;
// Duplicate check reads the id column of the tabs for these dates.
const DEDUP_DAYS_BACK = MAX_AGE_DAYS + 1;
const DEDUP_DAYS_AHEAD = 1;
const CONCURRENCY = 8;

const colLetter = (n) => String.fromCharCode(64 + n); // fine up to 26 columns
const LAST_ARTICLE_COL = colLetter(ARTICLE_COLUMNS.length);
const LAST_SOURCE_COL = colLetter(SOURCE_COLUMNS.length);
const LAST_HEALTH_COL = colLetter(HEALTH_COLUMNS.length);
const LAST_RUN_COL = colLetter(RUN_COLUMNS.length);

/** Where this run came from: GitHub (schedule / manual) or the PC's Sync now. */
function runIdentity() {
  const e = process.env;
  if (e.GITHUB_RUN_ID) {
    return {
      run_id: `gh-${e.GITHUB_RUN_ID}-${e.GITHUB_RUN_ATTEMPT || 1}`,
      trigger: e.GITHUB_EVENT_NAME === "schedule" ? "github-schedule" : "github-manual",
      url: `${e.GITHUB_SERVER_URL}/${e.GITHUB_REPOSITORY}/actions/runs/${e.GITHUB_RUN_ID}`,
    };
  }
  return { run_id: `pc-${Date.now().toString(36)}`, trigger: e.COLLECTOR_TRIGGER || "local", url: "" };
}

/** Append this run's row to _runs, creating the tab with its header atomically. */
async function logRun(sheet, tabs, run) {
  if (!tabs.has(RUNS_TAB)) {
    const sheetId = Math.floor(Math.random() * 2_000_000_000);
    try {
      await sheet.batchUpdate([
        {
          addSheet: {
            properties: {
              sheetId,
              title: RUNS_TAB,
              // No frozen header: Sheets rejects freezing a tab's only row.
              gridProperties: { rowCount: 1, columnCount: RUN_COLUMNS.length },
            },
          },
        },
        {
          updateCells: {
            start: { sheetId, rowIndex: 0, columnIndex: 0 },
            rows: [{ values: RUN_COLUMNS.map((c) => ({ userEnteredValue: { stringValue: c } })) }],
            fields: "userEnteredValue",
          },
        },
      ]);
    } catch (e) {
      if (!/already exists/i.test(e?.message || "")) throw e;
    }
  }
  await sheet.append(RUNS_TAB, LAST_RUN_COL, [RUN_COLUMNS.map((c) => run[c] ?? "")]);
}

/** Error text for public logs: no URLs, single line, short. */
const publicError = (msg) => String(msg).replace(/https?:\/\/\S+/g, "<url>").replace(/\s+/g, " ").slice(0, 120);

const rowsToObjects = (rows, columns) =>
  rows.slice(1).filter((r) => r[0]).map((r) => Object.fromEntries(columns.map((c, i) => [c, r[i] ?? ""])));

async function main() {
  const { SHEET_ID, GOOGLE_SERVICE_ACCOUNT_JSON } = process.env;
  if (!SHEET_ID || !GOOGLE_SERVICE_ACCOUNT_JSON) {
    throw new Error("SHEET_ID and GOOGLE_SERVICE_ACCOUNT_JSON must be set");
  }
  const sheet = await openSpreadsheet(SHEET_ID, GOOGLE_SERVICE_ACCOUNT_JSON);
  const started = Date.now();
  const nowIso = new Date(started).toISOString();
  const run = { ...runIdentity(), started_at: nowIso, status: "ok" };
  let tabs = new Map();
  const finish = async (fields) => {
    const finishedAt = Date.now();
    try {
      await logRun(sheet, tabs, {
        ...run,
        ...fields,
        finished_at: new Date(finishedAt).toISOString(),
        duration_ms: finishedAt - started,
      });
    } catch (e) {
      console.error(`Could not write the run log: ${publicError(e?.message || e)}`);
    }
  };
  try {
    await collectInto(sheet, started, nowIso, (t) => (tabs = t), finish);
  } catch (e) {
    await finish({ status: "error", error: String(e?.message || e).slice(0, 500) });
    throw e;
  }
}

async function collectInto(sheet, started, nowIso, setTabs, finish) {
  // --- read state: sources, previous health, recent ids (one request) ------
  const tabs = await sheet.tabs();
  setTabs(tabs);
  if (!tabs.has(SOURCES_TAB)) {
    console.log("No _sources tab yet — run the local sync once to publish the source list.");
    await finish({ status: "skipped", error: "no _sources tab yet" });
    return;
  }
  const dedupTabs = [];
  for (let d = -DEDUP_DAYS_BACK; d <= DEDUP_DAYS_AHEAD; d++) {
    const title = istDate(started + d * DAY);
    if ((tabs.get(title)?.rowCount ?? 0) > 1) dedupTabs.push(title);
  }
  const hasHealth = tabs.has(HEALTH_TAB);
  const [sourceRows, ...rest] = await sheet.read([
    sheet.range(SOURCES_TAB, `A1:${LAST_SOURCE_COL}`),
    ...(hasHealth ? [sheet.range(HEALTH_TAB, `A1:${LAST_HEALTH_COL}`)] : []),
    ...dedupTabs.map((t) => sheet.range(t, "A2:A")),
  ]);
  const healthRows = hasHealth ? rest[0] : [];
  const idColumns = hasHealth ? rest.slice(1) : rest;
  const previousHealth = new Map(rowsToObjects(healthRows, HEALTH_COLUMNS).map((h) => [h.source_id, h]));
  const seen = new Set(idColumns.flat().map((r) => r[0]).filter(Boolean));

  const sources = rowsToObjects(sourceRows, SOURCE_COLUMNS).filter(
    (s) => s.active === "1" || String(s.active).toUpperCase() === "TRUE"
  );
  if (!sources.length) {
    console.log("No active sources in _sources.");
    await finish({ status: "skipped", error: "no active sources" });
    return;
  }

  // --- fetch feeds with bounded concurrency -------------------------------
  const byTab = new Map(); // tab title -> rows
  const health = [];
  const details = []; // per source: items in feed, new, already had, too old, ms, error
  let stale = 0;
  let duplicates = 0;
  const queue = [...sources];

  async function worker() {
    for (let s = queue.shift(); s; s = queue.shift()) {
      const prev = previousHealth.get(s.id) || {};
      const t0 = Date.now();
      try {
        const feed = await fetchFeed(s.rss_url);
        const items = feed.items || [];
        let added = 0;
        let dup = 0;
        let old = 0;
        for (const item of items) {
          const a = normalizeItem(item, s);
          if (!a) continue;
          if (seen.has(a.id)) {
            dup++;
            continue;
          }
          const fresh = a.publishedMs !== null && a.publishedMs >= started - MAX_AGE_DAYS * DAY;
          if (a.publishedMs !== null && !fresh) {
            old++;
            continue;
          }
          seen.add(a.id);
          // File under the publish date; undated or future-dated items go
          // under today's date instead.
          const tab = fresh && a.publishedMs <= started + DAY ? istDate(a.publishedMs) : istDate(started);
          const row = {
            ...a,
            published_at: a.publishedMs === null ? "" : new Date(a.publishedMs).toISOString(),
            fetched_at: nowIso,
          };
          if (!byTab.has(tab)) byTab.set(tab, []);
          byTab.get(tab).push(ARTICLE_COLUMNS.map((c) => row[c] ?? ""));
          added++;
        }
        stale += old;
        duplicates += dup;
        health.push([s.id, nowIso, "ok", items.length, added, nowIso, prev.last_failure_at || "", ""]);
        details.push({ id: s.id, status: "ok", items: items.length, new: added, dup, old, ms: Date.now() - t0 });
        console.log(`${s.id}: ${items.length} in feed, ${added} new`);
      } catch (e) {
        const msg = e?.name === "AbortError" ? "timeout" : e?.message || String(e);
        health.push([s.id, nowIso, "error", 0, 0, prev.last_success_at || "", nowIso, msg.slice(0, 500)]);
        details.push({ id: s.id, status: "error", items: 0, new: 0, dup: 0, old: 0, ms: Date.now() - t0, error: msg.slice(0, 200) });
        console.log(`${s.id}: ERROR ${publicError(msg)}`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));

  // --- write: create missing tabs, then append ------------------------------
  // Grids hold exactly header + data rows (rowCount - 1 = data rows), which is
  // how the local sync knows what's new. A new tab and its header row are
  // created in one atomic request, so a concurrent run can never append data
  // above the header; if that run created the tab first, ours is skipped.
  const tabOrder = [...byTab.keys()].sort();
  for (const tab of tabOrder.filter((t) => !tabs.has(t))) {
    const sheetId = Math.floor(Math.random() * 2_000_000_000);
    try {
      await sheet.batchUpdate([
        {
          addSheet: {
            properties: {
              sheetId,
              title: tab,
              // No frozen header: Sheets rejects freezing a tab's only row.
              gridProperties: { rowCount: 1, columnCount: ARTICLE_COLUMNS.length },
            },
          },
        },
        {
          updateCells: {
            start: { sheetId, rowIndex: 0, columnIndex: 0 },
            rows: [{ values: ARTICLE_COLUMNS.map((c) => ({ userEnteredValue: { stringValue: c } })) }],
            fields: "userEnteredValue",
          },
        },
      ]);
    } catch (e) {
      if (!/already exists/i.test(e?.message || "")) throw e;
    }
  }
  for (const tab of tabOrder) await sheet.append(tab, LAST_ARTICLE_COL, byTab.get(tab));

  const structure = [];
  const values = [];
  health.sort((a, b) => a[0].localeCompare(b[0]));
  const healthTab = tabs.get(HEALTH_TAB);
  const healthGrid = { rowCount: health.length + 1, columnCount: HEALTH_COLUMNS.length, frozenRowCount: 1 };
  structure.push(
    healthTab
      ? {
          updateSheetProperties: {
            properties: { sheetId: healthTab.sheetId, gridProperties: healthGrid },
            fields: "gridProperties(rowCount,columnCount,frozenRowCount)",
          },
        }
      : { addSheet: { properties: { title: HEALTH_TAB, gridProperties: healthGrid } } }
  );
  values.push({ range: sheet.range(HEALTH_TAB, `A1:${LAST_HEALTH_COL}`), values: [HEALTH_COLUMNS, ...health] });

  await sheet.batchUpdate(structure);
  await sheet.write(values);

  const added = [...byTab.values()].reduce((n, r) => n + r.length, 0);
  const failed = health.filter((h) => h[2] === "error").length;
  console.log(
    `Done in ${((Date.now() - started) / 1000).toFixed(1)}s: ${sources.length} sources, ` +
      `${failed} failed, ${added} new articles across ${byTab.size} tab(s), ${stale} older than ${MAX_AGE_DAYS} days skipped.`
  );
  await finish({
    sources: sources.length,
    failed,
    new_articles: added,
    duplicates,
    skipped_old: stale,
    tabs: tabOrder.map((t) => `${t}:${byTab.get(t).length}`).join(" "),
    details: JSON.stringify(details.sort((a, b) => a.id.localeCompare(b.id))),
  });
  // Machine-readable summary for the local "Sync now" runner (local/collect.py).
  console.log(`RESULT ${JSON.stringify({ sources: sources.length, failed, new_articles: added, tabs: byTab.size })}`);
}

main().catch((e) => {
  console.error(`Collector failed: ${publicError(e?.message || e)}`);
  process.exit(1);
});
