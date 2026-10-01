import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { listFolders } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ folders: listFolders() });
}

/** POST { name } */
export async function POST(request: NextRequest) {
  const name = String((await request.json().catch(() => ({})))?.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
  db().prepare("insert or ignore into folders (name) values (?)").run(name);
  return NextResponse.json({ folder: db().prepare("select id, name from folders where name = ?").get(name) });
}

/** PATCH { id, name } — rename. */
export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const name = String(body?.name ?? "").trim();
  if (!body?.id || !name) return NextResponse.json({ error: "id and name are required" }, { status: 400 });
  try {
    db().prepare("update folders set name = ? where id = ?").run(name, Number(body.id));
  } catch {
    return NextResponse.json({ error: "A folder with that name already exists." }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}

/** DELETE ?id= — removes the folder and its saved entries; the articles stay in the archive. */
export async function DELETE(request: NextRequest) {
  const id = Number(request.nextUrl.searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  db().transaction(() => {
    db().prepare("delete from saved_items where folder_id = ?").run(id);
    db().prepare("update watchlists set autosave_folder = null where autosave_folder = ?").run(id);
    db().prepare("delete from folders where id = ?").run(id);
  })();
  return NextResponse.json({ ok: true });
}
