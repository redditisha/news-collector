/**
 * Where the app's data comes from:
 *  - local (default): the SQLite archive on this PC, kept up to date by the
 *    background jobs in local/. Everything is editable.
 *  - sheet (NEXT_PUBLIC_DATA_SOURCE=sheet, the hosted dashboard on Vercel):
 *    read-only, built from the Google Sheet — the last SHEET_RETENTION_DAYS
 *    of articles plus the stories, watchlists and translations the PC
 *    publishes there. Usable when the PC is off.
 */
export const HOSTED = process.env.NEXT_PUBLIC_DATA_SOURCE === "sheet";

/** Hosted: the widest date window one page loads (each day is one sheet tab). */
export const HOSTED_MAX_DAYS = 7;
