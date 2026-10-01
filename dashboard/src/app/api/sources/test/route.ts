import { NextResponse, type NextRequest } from "next/server";
import { testFeed } from "@/lib/rss/feed";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** POST { url } — validate an RSS URL without storing anything. */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  if (!body?.url) return NextResponse.json({ error: "url is required" }, { status: 400 });
  const result = await testFeed(String(body.url));
  return NextResponse.json(result);
}
