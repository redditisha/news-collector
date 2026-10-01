/** How headlines are shown: the publisher's original, or English where a translation exists. */
export type TitleMode = "en" | "original";

export interface Source {
  id: string;
  name: string;
  rss_url: string;
  language: string;
  country: string | null;
  region: string | null;
  category_group: string | null;
  primary_category: string | null;
  secondary_category: string | null;
  source_type: string | null;
  active: boolean;
  priority: number;
  last_checked_at: string | null;
  last_success_at: string | null;
  last_failure_at: string | null;
  last_error: string | null;
  article_count: number;
  created_at: string;
}

export interface Article {
  id: string;
  source_id: string;
  title: string;
  title_en: string | null;
  /** The sheet day tab it came through (YYYY-MM-DD). */
  sheet_tab?: string | null;
  url: string;
  guid: string | null;
  description: string | null;
  author: string | null;
  image_url: string | null;
  language: string;
  category_group: string | null;
  category: string | null;
  topic: string | null;
  published_at: string | null;
  fetched_at: string;
  synced_at?: string;               // when it reached this PC
  // Joined in queries:
  source?: Pick<Source, "id" | "name" | "language" | "category_group">;
  story_id?: number | null;
  story_sources?: number | null;   // outlets covering this article's story
  saved?: boolean;
  muted?: boolean;                 // flagged where muted articles are listed with the rest
  note?: string | null;            // on the Saved page: this folder's note
}

export interface Story {
  id: number;
  title: string;
  first_seen: string;
  last_seen: string;
  article_count: number;
  source_count: number;
  en_sources: number;
  kn_sources: number;
  hi_sources: number;
  avg_published?: string | null; // average publish time of its articles
  total_sources?: number;          // outlets overall, when the counts above are filtered
  total_articles?: number;
}

export interface Watchlist {
  id: number;
  name: string;
  terms: string;
  fields: "all" | "title";
  autosave_folder: number | null;
  last_viewed_at: string | null;
  sort: number;
  // computed
  total?: number;
  unread?: number;
  last_hour_sources?: number;
}

export interface Folder {
  id: number;
  name: string;
  count?: number;
}

export interface MuteRule {
  id: number;
  kind: "phrase" | "source" | "category";
  value: string;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pages: number;
}

export interface Category {
  group: string;
  name: string;
  slug: string;
  sort: number;
  active: boolean;
}
