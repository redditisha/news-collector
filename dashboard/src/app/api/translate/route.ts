import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { HOSTED } from "@/lib/mode";
import { writeTitleEn } from "@/lib/sheetdata";

export const dynamic = "force-dynamic";

const LANGS = new Set(["kn", "hi", "ta", "te", "mr", "ml", "bn", "gu", "pa", "or", "ur"]);

/**
 * Google Translate's free public endpoint (the one translate.google.com's
 * widgets use; no key). Unofficial: fine for one headline at a time, not for
 * bulk — bulk translation is the PC's job.
 */
async function googleTranslate(text: string, from: string): Promise<string> {
  const sl = LANGS.has(from) ? from : "auto";
  const q = encodeURIComponent(text);
  const get = (url: string) => fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10000) });
  // The Chrome dictionary extension's endpoint, then the website widgets' one
  // (Google sometimes rate-limits an address on one but not the other).
  let res = await get(`https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=${sl}&tl=en&q=${q}`);
  if (res.ok) {
    // ["text"], or [["text", "detected-lang"]] with sl=auto
    const data = await res.json();
    const first = Array.isArray(data) ? data[0] : null;
    const out = Array.isArray(first) ? first[0] : first;
    if (typeof out === "string" && out.trim()) return out.trim();
  }
  res = await get(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=en&dt=t&q=${q}`);
  if (!res.ok) throw new Error(`Google Translate ${res.status}`);
  const data = await res.json();
  return ((data?.[0] ?? []) as [string][]).map((p) => p[0]).join("").trim();
}

/**
 * POST { id, title, language, tab } — translate one headline to English and
 * keep it: in the PC's archive (local; published to the sheet on the next
 * sync) or straight into the sheet row (hosted).
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const id = String(body?.id ?? "");
  const title = String(body?.title ?? "").slice(0, 1000);
  const language = String(body?.language ?? "auto");
  if (!id || !title) return NextResponse.json({ error: "id and title are required" }, { status: 400 });
  let titleEn: string;
  try {
    titleEn = await googleTranslate(title, language);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Translation failed" }, { status: 502 });
  }
  if (!titleEn) return NextResponse.json({ error: "No translation returned" }, { status: 502 });

  let saved = false;
  if (HOSTED) {
    try {
      saved = await writeTitleEn(String(body?.tab ?? ""), id, titleEn);
    } catch {
      saved = false; // still show it
    }
    db().prepare("update articles set title_en = ? where id = ? and title_en is null").run(titleEn, id);
  } else {
    saved =
      db()
        .prepare("update articles set title_en = ?, translated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') where id = ? and title_en is null")
        .run(titleEn, id).changes > 0;
  }
  return NextResponse.json({ title_en: titleEn, saved });
}
