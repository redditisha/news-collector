// Sheet layout contract. local/sync.py mirrors these column orders — change
// both together.
//
//   _sources         written by the PC (local sync), read by the collector
//   _health          written by the collector, read by the PC
//   _runs            one row per collector run (appended), read by the PC
//   YYYY-MM-DD tabs  one per publish date (IST), append-only, written by the
//                    collector; the PC fills in title_en (its translation)
//                    and deletes tabs after archiving (SHEET_RETENTION_DAYS)
//   _stories, _watchlists, _pc_status
//                    published by the PC for the hosted dashboard

export const TZ = "Asia/Kolkata";

export const SOURCES_TAB = "_sources";
export const SOURCE_COLUMNS = [
  "id", "name", "rss_url", "language", "country", "region", "category_group",
  "primary_category", "secondary_category", "source_type", "priority", "active",
];

export const HEALTH_TAB = "_health";
export const HEALTH_COLUMNS = [
  "source_id", "last_checked_at", "status", "items_in_feed", "new_articles",
  "last_success_at", "last_failure_at", "last_error",
];

// One row per collector run (GitHub or PC), for the app's run logs. The PC
// copies rows into its archive and trims old ones from the sheet.
export const RUNS_TAB = "_runs";
export const RUN_COLUMNS = [
  "run_id", "started_at", "finished_at", "trigger", "status", "duration_ms", "sources", "failed",
  "new_articles", "duplicates", "skipped_old", "tabs", "details", "url", "error",
];

export const ARTICLE_COLUMNS = [
  "id", "published_at", "fetched_at", "source_id", "source_name", "language",
  // title_en: left blank here; the PC (or the dashboard's Translate button)
  // writes the English headline. Was "author" in tabs before Oct 2026.
  "title", "url", "description", "title_en", "image_url", "guid",
  "category_group", "category", "topic",
];

export const DATE_TAB = /^\d{4}-\d{2}-\d{2}$/;

/** IST calendar date (YYYY-MM-DD) of a timestamp. */
export function istDate(ms) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date(ms));
}
