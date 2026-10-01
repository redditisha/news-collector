import { SHEET_WARN_AT, sheetHealth } from "@/lib/sheetdata";
import { timeAgo } from "@/lib/utils";

/**
 * Online only: once the Google Sheet passes SHEET_WARN_AT (70%) of its cell
 * limit, a small banner on every page says the PC needs to sync — old days
 * are only cleared from the sheet after the PC has copied them, and at 100%
 * collection stops. Shows the PC's last sync and how much is copied.
 */
export async function SheetBanner() {
  const h = await sheetHealth();
  if (!h || h.fill < SHEET_WARN_AT) return null;
  const pct = Math.round(h.fill * 100);
  const copiedPct = h.rows ? Math.floor((h.copied / h.rows) * 100) : 100;
  const urgent = h.fill >= 0.9;
  return (
    <div
      className={`mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-3 py-2 text-sm ${
        urgent ? "border-red-200 bg-red-50 text-red-800" : "border-amber-200 bg-amber-50 text-amber-900"
      }`}
    >
      <span className="font-semibold">⚠ Sync needed — sheet {pct}% full</span>
      <span suppressHydrationWarning>
        Last PC sync: {h.lastPcSync ? timeAgo(h.lastPcSync) : "never"} · {copiedPct}% of the sheet&apos;s{" "}
        {h.rows.toLocaleString()} articles copied to the PC
      </span>
      <span className="text-xs opacity-80">
        Turn the PC on (or open the app there) to sync; copied days are then cleared from the sheet.
      </span>
    </div>
  );
}
