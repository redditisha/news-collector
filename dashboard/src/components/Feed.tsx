"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArticleCard } from "./ArticleCard";
import type { Article } from "@/lib/types";

/**
 * List of article cards. Optional live auto-refresh re-runs the server
 * render (keeps the current filters and page).
 */
export function Feed({
  articles,
  autoRefresh = false,
  refreshMs = 60000,
  empty = "Nothing here for these filters.",
  folderId,
  watchlist,
}: {
  articles: Article[];
  autoRefresh?: boolean;
  refreshMs?: number;
  empty?: React.ReactNode;
  folderId?: number;
  /** On a watchlist page: show "remove from watchlist" (or "put back" when viewing removed ones). */
  watchlist?: { id: number; removed?: boolean };
}) {
  const router = useRouter();

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => router.refresh(), refreshMs);
    return () => clearInterval(id);
  }, [autoRefresh, refreshMs, router]);

  if (articles.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">{empty}</div>
    );
  }

  return (
    <div className="space-y-3">
      {articles.map((a) => (
        <ArticleCard key={a.id} article={a} folderId={folderId} watchlist={watchlist} onRemoved={() => router.refresh()} />
      ))}
    </div>
  );
}
