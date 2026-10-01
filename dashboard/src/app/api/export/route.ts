import { ensureData, hostedFilters } from "@/lib/sheetdata";
import { type NextRequest } from "next/server";
import { parseFilters } from "@/lib/filters";
import { rawSlice, RAW_COLUMNS } from "@/lib/queries";

export const dynamic = "force-dynamic";

const BOM = String.fromCharCode(0xfeff); // lets Excel detect UTF-8 (Kannada text)
const EOL = String.fromCharCode(13, 10);
const SLICE = 1000;

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * GET — every article matching the filters (same URL params as Browse /
 * Raw data), all fields, as CSV. Muted articles are included and flagged.
 * Streamed in slices so large exports don't hold everything in memory.
 */
export async function GET(request: NextRequest) {
  const f = hostedFilters(parseFilters(Object.fromEntries(request.nextUrl.searchParams)));
  await ensureData({ filters: f });
  const encoder = new TextEncoder();
  let offset = 0;
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(BOM + RAW_COLUMNS.join(",") + EOL));
    },
    pull(controller) {
      const rows = rawSlice(f, offset, SLICE);
      offset += rows.length;
      if (rows.length) {
        controller.enqueue(encoder.encode(rows.map((r) => RAW_COLUMNS.map((c) => csvCell(r[c])).join(",") + EOL).join("")));
      }
      if (rows.length < SLICE) controller.close();
    },
  });
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
  return new Response(stream, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="news-articles-${stamp}.csv"`,
    },
  });
}
