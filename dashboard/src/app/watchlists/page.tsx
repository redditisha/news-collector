import { ensureData } from "@/lib/sheetdata";
import { Shell } from "@/components/Shell";
import { WatchlistManager } from "@/components/WatchlistManager";
import { listFolders, listWatchlists, SPIKE_SOURCES } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function WatchlistsPage() {
  await ensureData({ filters: { range: "24h" } });
  return (
    <Shell title="Watchlists" subtitle="Keywords you track. Matches from every outlet, in English or Kannada, land here.">
      <WatchlistManager watchlists={listWatchlists()} folders={listFolders()} spikeSources={SPIKE_SOURCES} />
    </Shell>
  );
}
