import { ensureData } from "@/lib/sheetdata";
import { HOSTED } from "@/lib/mode";
import { Sidebar, type SidebarData } from "./Sidebar";
import { LanguageToggle } from "./LanguageToggle";
import { SheetBanner } from "./SheetBanner";
import { getPipelineStatus } from "@/lib/pipeline";
import { countArticles, listWatchlists, SPIKE_SOURCES } from "@/lib/queries";
import { db } from "@/lib/db";

async function sidebarData(): Promise<SidebarData> {
  await ensureData();
  const status = await getPipelineStatus();
  return {
    watchlists: listWatchlists().map((w) => ({
      id: w.id,
      name: w.name,
      unread: HOSTED ? 0 : w.unread ?? 0, // no "last opened" online
      spike: (w.last_hour_sources ?? 0) >= SPIKE_SOURCES,
    })),
    savedCount: (db().prepare("select count(distinct article_id) as n from saved_items").get() as { n: number }).n,
    mutedCount: countArticles({}, { muted: "only" }),
    collector: {
      lastCollectedAt: status.lastCollectedAt,
      lastCollectedBy: status.lastCollectedBy,
      freshness: status.freshness,
    },
  };
}

/** Page chrome: sidebar (sections, watchlists, collector status) + content column. */
export async function Shell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const data = await sidebarData();
  return (
    <>
      <Sidebar data={data} />
      <main className="mx-auto max-w-6xl px-4 py-6 lg:ml-60 lg:max-w-none lg:px-8">
        <div className="mx-auto max-w-5xl">
          {HOSTED ? <SheetBanner /> : null}
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-2xl font-bold text-ink">{title}</h1>
              {subtitle ? <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p> : null}
            </div>
            <div className="flex items-center gap-3">
              {actions}
              <div className="lg:hidden">
                <LanguageToggle />
              </div>
            </div>
          </div>
          {children}
        </div>
      </main>
    </>
  );
}
