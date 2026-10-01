import { NextResponse } from "next/server";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { getPipelineStatus } from "@/lib/pipeline";

export const dynamic = "force-dynamic";

/**
 * Admin buttons, run in the background (returns immediately; progress: GET):
 *  - "Sync now" (default): the whole pipeline — collect all feeds into the
 *    sheet (same code as the GitHub collector), copy new rows to this PC,
 *    translate, stories, publish.
 *  - "Sync data" ({ mode: "data" }): just the sheet <-> PC exchange — new
 *    articles and translations made elsewhere (the cloud translator) come in,
 *    this PC's translations and stories go out. No collecting or translating,
 *    so it takes seconds, even while a long translation run is going.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const args = body?.mode === "data" ? ["--data"] : ["--collect"];
  const root = process.cwd();
  const venvPython = path.join(root, "local", ".venv", "Scripts", "pythonw.exe");
  const python = process.env.NEWS_PYTHON || (fs.existsSync(venvPython) ? venvPython : "python");
  try {
    const child = spawn(python, [path.join(root, "local", "run.py"), ...args], {
      cwd: path.join(root, "local"),
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.on("error", () => {}); // shows up as no new run in GET
    child.unref();
    return NextResponse.json({ ok: true, startedAt: new Date().toISOString() });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}

/** Current pipeline status; the Admin page polls this while a run is going. */
export async function GET() {
  return NextResponse.json(await getPipelineStatus());
}
