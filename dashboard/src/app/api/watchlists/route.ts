import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { listWatchlists } from "@/lib/queries";

export const dynamic = "force-dynamic";

function clean(body: any) {
  const terms = String(body?.terms ?? "")
    .split(/\r?\n/)
    // A trailing space is meaningful (whole-word match), so keep one.
    .map((t: string) => t.trimStart().replace(/\s+$/, " "))
    .filter((t: string) => t.trim())
    .join("\n");
  return {
    name: String(body?.name ?? "").trim(),
    terms,
    fields: body?.fields === "title" ? "title" : "all",
    autosave_folder: body?.autosave_folder ? Number(body.autosave_folder) : null,
  };
}

export async function GET() {
  return NextResponse.json({ watchlists: listWatchlists() });
}

/** POST { name, terms (one per line), fields, autosave_folder } */
export async function POST(request: NextRequest) {
  const w = clean(await request.json().catch(() => ({})));
  if (!w.name || !w.terms) {
    return NextResponse.json({ error: "A name and at least one term are required." }, { status: 400 });
  }
  const sort = (db().prepare("select coalesce(max(sort), 0) + 1 as n from watchlists").get() as { n: number }).n;
  const id = db()
    .prepare(
      "insert into watchlists (name, terms, fields, autosave_folder, sort) values (@name, @terms, @fields, @autosave_folder, @sort)"
    )
    .run({ ...w, sort }).lastInsertRowid;
  return NextResponse.json({ id: Number(id) });
}

/** PATCH { id, name, terms, fields, autosave_folder } */
export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  if (!body?.id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  const w = clean(body);
  if (!w.name || !w.terms) {
    return NextResponse.json({ error: "A name and at least one term are required." }, { status: 400 });
  }
  db()
    .prepare(
      "update watchlists set name = @name, terms = @terms, fields = @fields, autosave_folder = @autosave_folder where id = @id"
    )
    .run({ ...w, id: Number(body.id) });
  return NextResponse.json({ ok: true });
}

/** DELETE ?id= */
export async function DELETE(request: NextRequest) {
  const id = Number(request.nextUrl.searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  db().prepare("delete from watchlists where id = ?").run(id);
  return NextResponse.json({ ok: true });
}
