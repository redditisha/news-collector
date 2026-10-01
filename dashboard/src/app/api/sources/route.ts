import { NextResponse, type NextRequest } from "next/server";
import { db, newSourceId } from "@/lib/db";
import { fetchSources } from "@/lib/queries";

export const dynamic = "force-dynamic";

// Source edits reach the collector on the next local sync, which publishes
// this list to the sheet's _sources tab.

const EDITABLE = [
  "name", "rss_url", "language", "country", "region", "category_group",
  "primary_category", "secondary_category", "source_type", "active", "priority",
] as const;

function pick(body: Record<string, any>) {
  const out: Record<string, any> = {};
  for (const k of EDITABLE) {
    if (!(k in body)) continue;
    const v = body[k];
    out[k] = k === "active" ? (v ? 1 : 0) : v === "" ? null : v;
  }
  return out;
}

function errorResponse(e: any) {
  const message = String(e?.message || e);
  const status = message.includes("UNIQUE") ? 409 : 500;
  return NextResponse.json(
    { error: status === 409 ? "A source with this RSS URL already exists." : message },
    { status }
  );
}

/** GET — list all sources (Admin). */
export async function GET() {
  return NextResponse.json({ sources: await fetchSources() });
}

/** POST — create a source. */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  if (!body?.name || !body?.rss_url) {
    return NextResponse.json({ error: "name and rss_url are required" }, { status: 400 });
  }
  const row = { ...pick(body), id: newSourceId() };
  const cols = Object.keys(row);
  try {
    db()
      .prepare(`insert into sources (${cols.join(", ")}) values (${cols.map((c) => "@" + c).join(", ")})`)
      .run(row);
  } catch (e) {
    return errorResponse(e);
  }
  return NextResponse.json({ source: { id: row.id } });
}

/** PATCH — update a source (body must include `id`). */
export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  if (!body?.id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  const changes = pick(body);
  const cols = Object.keys(changes);
  if (!cols.length) return NextResponse.json({ ok: true });
  try {
    db()
      .prepare(
        `update sources set ${cols.map((c) => `${c} = @${c}`).join(", ")},
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') where id = @id`
      )
      .run({ ...changes, id: body.id });
  } catch (e) {
    return errorResponse(e);
  }
  return NextResponse.json({ ok: true });
}

/** DELETE — remove a source (?id=...). Its archived articles are kept. */
export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  db().prepare("delete from sources where id = ?").run(id);
  return NextResponse.json({ ok: true });
}
