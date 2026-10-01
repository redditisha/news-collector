import { ensureData, hostedFilters } from "@/lib/sheetdata";
import { NextResponse, type NextRequest } from "next/server";
import { parseFilters } from "@/lib/filters";
import { fetchArticleTexts, getWatchlist, watchlistScope, type Scope } from "@/lib/queries";
import { computeNgrams, type TextField } from "@/lib/ngrams";

export const dynamic = "force-dynamic";

/**
 * GET — n-grams over the articles matching the page's filters (same URL
 * params as Browse). Extra params:
 *   field  en | original | summary   (English headline, original headline, summary)
 *   n      1-3
 *   stop   1 | 0                     (drop phrases starting/ending with stop words)
 *   min    minimum count
 *   by     articles | sources
 *   story  a story id: only that story's articles
 *   watchlist  a watchlist id: only its matches
 */
export async function GET(request: NextRequest) {
  const sp = Object.fromEntries(request.nextUrl.searchParams);
  // The picked phrase (ng) narrows only the article list, never the phrase list.
  const storyParam = Number(sp.story) || undefined;
  // Inside a story every member counts, whatever the dates; elsewhere the page's window.
  const f = { ...(storyParam ? parseFilters(sp) : hostedFilters(parseFilters(sp))), ng: "" };
  await ensureData(storyParam ? { storyId: storyParam } : { filters: f });
  const field = (["en", "original", "summary"].includes(sp.field) ? sp.field : "en") as TextField;
  const n = Math.min(3, Math.max(1, parseInt(sp.n) || 2));
  const storyId = Number(sp.story) || undefined;
  const w = Number(sp.watchlist) ? getWatchlist(Number(sp.watchlist)) : undefined;
  // Inside a story or watchlist every match counts (a mute rule shouldn't hide part of it).
  let scope: Scope = { muted: sp.muted === "only" ? "only" : "exclude" };
  if (storyId) scope = { storyId, muted: "include" };
  else if (w) {
    const ws = watchlistScope(w);
    if (!ws) return NextResponse.json({ articles: 0, ngrams: [] });
    scope = ws;
  }
  const rows = fetchArticleTexts(f, scope);
  const ngrams = computeNgrams(rows, {
    field,
    n,
    stopwords: sp.stop !== "0",
    minCount: Math.max(1, parseInt(sp.min) || 2),
    by: sp.by === "sources" ? "sources" : "articles",
    limit: 200,
  });
  return NextResponse.json({ articles: rows.length, ngrams });
}
