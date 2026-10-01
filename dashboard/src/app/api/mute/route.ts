import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { listMuteRules } from "@/lib/queries";

export const dynamic = "force-dynamic";

const KINDS = ["phrase", "source", "category"];

export async function GET() {
  return NextResponse.json({ rules: listMuteRules() });
}

/** POST { kind, value } — matching articles move to the Muted section; nothing is deleted. */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const kind = String(body?.kind ?? "");
  const value = String(body?.value ?? "").trim();
  if (!KINDS.includes(kind) || !value) {
    return NextResponse.json({ error: "kind (phrase|source|category) and value are required" }, { status: 400 });
  }
  db().prepare("insert or ignore into mute_rules (kind, value) values (?, ?)").run(kind, value);
  return NextResponse.json({ ok: true });
}

/** DELETE ?id= */
export async function DELETE(request: NextRequest) {
  const id = Number(request.nextUrl.searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  db().prepare("delete from mute_rules where id = ?").run(id);
  return NextResponse.json({ ok: true });
}
