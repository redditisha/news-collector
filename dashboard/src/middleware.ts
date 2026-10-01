import { NextResponse, type NextRequest } from "next/server";

/**
 * Hosted dashboard (NEXT_PUBLIC_DATA_SOURCE=sheet) is read-only: no writes
 * except the Translate button, and no PC-only sections. Local mode: no-op.
 */
export function middleware(request: NextRequest) {
  if (process.env.NEXT_PUBLIC_DATA_SOURCE !== "sheet") return NextResponse.next();
  const { pathname } = request.nextUrl;
  if (pathname === "/saved" || pathname === "/muted") return NextResponse.redirect(new URL("/", request.url));
  if (pathname.startsWith("/api/") && request.method !== "GET" && pathname !== "/api/translate") {
    return NextResponse.json({ error: "The online dashboard is read-only — make changes in the app on the PC." }, { status: 403 });
  }
  return NextResponse.next();
}

export const config = { matcher: ["/api/:path*", "/saved", "/muted"] };
