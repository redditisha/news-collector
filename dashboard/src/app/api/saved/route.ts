import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { savedFolderIds } from "@/lib/queries";

export const dynamic = "force-dynamic";

function readLaterId(): number {
  db().prepare("insert or ignore into folders (name) values ('Read later')").run();
  return (db().prepare("select id from folders where name = 'Read later'").get() as { id: number }).id;
}

/** GET ?article=ID — folders the article is saved in. */
export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("article");
  if (!id) return NextResponse.json({ error: "article is required" }, { status: 400 });
  return NextResponse.json({ folders: savedFolderIds(id) });
}

/** POST { article, folder? } — save into a folder (default "Read later"). */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  if (!body?.article) return NextResponse.json({ error: "article is required" }, { status: 400 });
  const folder = Number(body.folder) || readLaterId();
  db().prepare("insert or ignore into saved_items (article_id, folder_id) values (?, ?)").run(body.article, folder);
  return NextResponse.json({ ok: true, folders: savedFolderIds(body.article) });
}

/** PATCH { article, folder, note } — set the note on a saved item. */
export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  if (!body?.article || !body?.folder) {
    return NextResponse.json({ error: "article and folder are required" }, { status: 400 });
  }
  db()
    .prepare("update saved_items set note = ? where article_id = ? and folder_id = ?")
    .run(String(body.note ?? "").trim() || null, body.article, Number(body.folder));
  return NextResponse.json({ ok: true });
}

/** DELETE ?article=ID&folder=ID — unsave (from every folder when folder is omitted). */
export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("article");
  const folder = request.nextUrl.searchParams.get("folder");
  if (!id) return NextResponse.json({ error: "article is required" }, { status: 400 });
  if (folder) db().prepare("delete from saved_items where article_id = ? and folder_id = ?").run(id, Number(folder));
  else db().prepare("delete from saved_items where article_id = ?").run(id);
  return NextResponse.json({ ok: true, folders: savedFolderIds(id) });
}
