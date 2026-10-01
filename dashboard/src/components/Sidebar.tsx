"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { LanguageToggle } from "./LanguageToggle";
import { timeAgo } from "@/lib/utils";
import type { PipelinePanelStatus } from "./sidebarTypes";
import { HOSTED } from "@/lib/mode";

export interface SidebarData {
  watchlists: { id: number; name: string; unread: number; spike: boolean }[];
  savedCount: number;
  mutedCount: number;
  collector: PipelinePanelStatus;
}

// Saved and Muted are personal, PC-only sections.
const PC_ONLY = new Set(["/saved", "/muted"]);
const ALL_SECTIONS = [
  { href: "/", label: "Today", icon: "☀" },
  { href: "/watchlists", label: "Watchlists", icon: "◎" },
  { href: "/stories", label: "Stories", icon: "▦" },
  { href: "/browse", label: "Browse", icon: "☰" },
  { href: "/saved", label: "Saved", icon: "★" },
  { href: "/muted", label: "Muted", icon: "⊘" },
  { href: "/archive", label: "Archive", icon: "🗓" },
  { href: "/data", label: "Raw data", icon: "▤" },
  { href: "/admin", label: "Admin", icon: "⚙" },
  { href: "/admin/logs", label: "Logs", icon: "≡" },
];

const SECTIONS = HOSTED ? ALL_SECTIONS.filter((s) => !PC_ONLY.has(s.href)) : ALL_SECTIONS;

const TONE: Record<PipelinePanelStatus["freshness"], string> = {
  ok: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  stale: "bg-amber-50 text-amber-800 ring-amber-200",
  old: "bg-red-50 text-red-700 ring-red-200",
  unknown: "bg-slate-100 text-slate-600 ring-slate-200",
};

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (href === "/admin") return pathname === "/admin"; // Logs has its own entry
  return pathname === href || pathname.startsWith(href + "/");
}

/** When the feeds were last collected; amber/red when the collector has gone quiet. */
function CollectorBadge({ c }: { c: PipelinePanelStatus }) {
  const hint = c.lastCollectedAt
    ? `Last collection: ${new Date(c.lastCollectedAt).toLocaleString()} (${
        c.lastCollectedBy === "github" ? "GitHub schedule" : "manual Sync now"
      }). Click for pipeline status.`
    : "No collector run found yet. Click for pipeline status.";
  return (
    <Link
      href="/admin"
      title={hint}
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${TONE[c.freshness]}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      <span suppressHydrationWarning>{c.lastCollectedAt ? `Collected ${timeAgo(c.lastCollectedAt)}` : "Not collected yet"}</span>
    </Link>
  );
}

function Count({ n, tone = "slate" }: { n: number; tone?: "slate" | "brand" }) {
  if (!n) return null;
  return (
    <span
      className={`ml-auto rounded-full px-1.5 text-[11px] font-semibold ${
        tone === "brand" ? "bg-brand text-white" : "bg-slate-200 text-slate-600"
      }`}
    >
      {n > 999 ? "999+" : n}
    </span>
  );
}

export function Sidebar({ data }: { data: SidebarData }) {
  const pathname = usePathname();
  // Phones: the full menu opens as a drawer; close it on navigation.
  const [menu, setMenu] = useState(false);
  useEffect(() => setMenu(false), [pathname]);
  const unreadTotal = data.watchlists.reduce((s, w) => s + w.unread, 0);

  const link = (href: string, label: string, icon: string, extra?: React.ReactNode) => (
    <Link
      key={href}
      href={href}
      className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition ${
        isActive(pathname, href) ? "bg-brand-soft font-semibold text-brand" : "text-slate-600 hover:bg-slate-100"
      }`}
    >
      <span className="w-4 text-center text-xs opacity-70">{icon}</span>
      <span className="truncate">{label}</span>
      {extra}
    </Link>
  );

  const fullNav = (
    <>
      {link("/", "Today", "☀")}
      {link("/watchlists", "Watchlists", "◎", <Count n={unreadTotal} tone="brand" />)}
      <div className="mb-1 ml-6 flex flex-col gap-0.5 border-l border-slate-200 pl-2">
        {data.watchlists.map((w) => (
          <Link
            key={w.id}
            href={`/watchlists/${w.id}`}
            className={`flex items-center gap-1.5 rounded px-2 py-1 text-[13px] ${
              isActive(pathname, `/watchlists/${w.id}`) ? "bg-brand-soft font-semibold text-brand" : "text-slate-500 hover:bg-slate-100"
            }`}
            title={w.spike ? "Several outlets reported this in the last hour" : undefined}
          >
            {w.spike ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" /> : null}
            <span className="truncate">{w.name}</span>
            <Count n={w.unread} tone="brand" />
          </Link>
        ))}
      </div>
      {link("/stories", "Stories", "▦")}
      {link("/browse", "Browse", "☰")}
      {HOSTED ? null : link("/saved", "Saved", "★", <Count n={data.savedCount} />)}
      {HOSTED ? null : link("/muted", "Muted", "⊘", <Count n={data.mutedCount} />)}
      {link("/archive", "Archive", "🗓")}
      {link("/data", "Raw data", "▤")}
      {link("/admin", "Admin", "⚙")}
      {link("/admin/logs", "Logs", "≡")}
    </>
  );

  return (
    <aside className="sticky top-0 z-40 border-b border-slate-200 bg-white lg:fixed lg:inset-y-0 lg:left-0 lg:w-60 lg:border-b-0 lg:border-r">
      <div className="flex h-full flex-col gap-2 px-3 py-2 lg:gap-3 lg:py-4">
        <div className="flex items-center justify-between gap-2 px-1">
          <Link href="/" className="text-lg font-bold text-ink">
            📰 News<span className="text-brand">Monitor</span>{HOSTED ? <span className="ml-1.5 rounded bg-slate-100 px-1.5 py-0.5 align-middle text-[10px] font-semibold uppercase tracking-wide text-slate-500">online</span> : null}
          </Link>
          <div className="flex items-center gap-2 lg:hidden">
            <CollectorBadge c={data.collector} />
            <button
              onClick={() => setMenu(true)}
              className="rounded-md border border-slate-200 px-2.5 py-1 text-lg leading-none text-slate-600"
              aria-label="Open menu"
            >
              ☰
            </button>
          </div>
        </div>

        {/* Narrow screens: a scrollable row of sections */}
        <nav className="no-scrollbar -mx-3 flex gap-1 overflow-x-auto px-3 pb-1 lg:hidden">
          {SECTIONS.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm ${
                isActive(pathname, s.href) ? "bg-brand-soft font-semibold text-brand" : "text-slate-600"
              }`}
            >
              {s.label}
              {s.href === "/watchlists" && unreadTotal ? ` (${unreadTotal})` : ""}
            </Link>
          ))}
        </nav>

        {/* Wide screens: full sidebar */}
        <nav className="hidden min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto lg:flex">
          {fullNav}
        </nav>

        {menu ? (
          <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
            <button className="absolute inset-0 bg-slate-900/40" onClick={() => setMenu(false)} aria-label="Close menu" />
            <div className="absolute inset-y-0 right-0 flex w-72 max-w-[85vw] flex-col gap-3 overflow-y-auto bg-white p-3 shadow-xl">
              <div className="flex items-center justify-between px-1">
                <span className="text-sm font-semibold text-slate-500">Menu</span>
                <button onClick={() => setMenu(false)} className="rounded-md px-2 py-1 text-lg leading-none text-slate-500" aria-label="Close menu">
                  ✕
                </button>
              </div>
              <nav className="flex flex-col gap-0.5">{fullNav}</nav>
              <div className="border-t border-slate-100 pt-3">
                <LanguageToggle />
              </div>
            </div>
          </div>
        ) : null}

        <div className="hidden flex-col gap-2 border-t border-slate-100 pt-3 lg:flex">
          <CollectorBadge c={data.collector} />
          <LanguageToggle />
        </div>
      </div>
    </aside>
  );
}
