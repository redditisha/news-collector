import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// Hand-removing an article from a watchlist: it stays in the archive (and in
// any folder it was saved to), it just no longer shows under that watchlist.

/** POST { watchlist, article } — take the article out of the watchlist. */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const watchlist = Number(body?.watchlist);
  if (!watchlist || !body?.article) return NextResponse.json({ error: "watchlist and article are required" }, { status: 400 });
  db().prepare("insert or ignore into watchlist_removed (watchlist_id, article_id) values (?, ?)").run(watchlist, String(body.article));
  return NextResponse.json({ ok: true });
}

/** DELETE ?watchlist=&article= — put it back. */
export async function DELETE(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const watchlist = Number(sp.get("watchlist"));
  const article = sp.get("article");
  if (!watchlist || !article) return NextResponse.json({ error: "watchlist and article are required" }, { status: 400 });
  db().prepare("delete from watchlist_removed where watchlist_id = ? and article_id = ?").run(watchlist, article);
  return NextResponse.json({ ok: true });
}
