-- ===========================================================================
-- Local archive (SQLite). The permanent store for every article.
-- Shared by local/sync.py (writes articles), local/translate.py (writes
-- title_en) and the Next.js app (reads everything, edits sources).
-- Idempotent: safe to run on every open.
-- ===========================================================================

pragma journal_mode = wal;

create table if not exists categories (
  slug    text primary key,
  "group" text not null,
  name    text not null,
  sort    integer not null default 100,
  active  integer not null default 1
);

-- id is a short random key, stable for the life of the source (editing the
-- URL keeps it). The GitHub collector tags every article with this key.
create table if not exists sources (
  id                 text primary key,
  name               text not null,
  rss_url            text not null unique,
  language           text not null default 'en',
  country            text,
  region             text,
  category_group     text,
  primary_category   text,
  secondary_category text,
  source_type        text default 'newspaper',
  active             integer not null default 1,
  priority           integer not null default 3,
  -- health, reported by the collector through the sheet's _health tab
  last_checked_at    text,
  last_success_at    text,
  last_failure_at    text,
  last_error         text,
  created_at         text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at         text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- id = first 16 hex chars of sha1(source_id | dedup_key), computed by the
-- collector, so re-syncing the same row is always a no-op.
create table if not exists articles (
  id             text primary key,
  source_id      text not null,
  title          text not null,
  title_en       text,            -- English translation for non-English titles
  url            text not null,
  guid           text,
  description    text,
  author         text,
  image_url      text,
  language       text not null default 'en',
  category_group text,
  category       text,
  topic          text,
  published_at   text,
  fetched_at     text not null,
  sheet_tab      text,            -- the sheet tab (IST date) it arrived through
  synced_at      text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  translated_at  text
);

create index if not exists articles_published_idx on articles (published_at desc);
create index if not exists articles_fetched_idx   on articles (fetched_at desc);
create index if not exists articles_source_idx    on articles (source_id);
create index if not exists articles_category_idx  on articles (category);
create index if not exists articles_group_idx     on articles (category_group);
create index if not exists articles_untranslated_idx
  on articles (published_at desc) where title_en is null and language <> 'en';

-- Full-text search over original title, English title and summary.
create virtual table if not exists articles_fts using fts5(
  title, title_en, description,
  content = 'articles', content_rowid = 'rowid', tokenize = 'unicode61'
);

create trigger if not exists articles_fts_ai after insert on articles begin
  insert into articles_fts (rowid, title, title_en, description)
  values (new.rowid, new.title, new.title_en, new.description);
end;
create trigger if not exists articles_fts_ad after delete on articles begin
  insert into articles_fts (articles_fts, rowid, title, title_en, description)
  values ('delete', old.rowid, old.title, old.title_en, old.description);
end;
create trigger if not exists articles_fts_au after update of title, title_en, description on articles begin
  insert into articles_fts (articles_fts, rowid, title, title_en, description)
  values ('delete', old.rowid, old.title, old.title_en, old.description);
  insert into articles_fts (rowid, title, title_en, description)
  values (new.rowid, new.title, new.title_en, new.description);
end;

-- How many data rows of each sheet tab are already stored locally. Tabs are
-- append-only, so the next sync reads only rows beyond this count.
create table if not exists sheet_tabs (
  title        text primary key,
  rows_synced  integer not null default 0,
  last_sync_at text,
  deleted_at   text             -- set once the tab is verified and removed from the sheet
);

-- Collector runs started from this PC ("Sync now"). Scheduled GitHub runs are
-- read live from the GitHub API instead.
create table if not exists collector_runs (
  id             integer primary key autoincrement,
  started_at     text not null,
  finished_at    text,
  status         text not null default 'running',   -- running | ok | error
  sources        integer,
  failed_sources integer,
  new_articles   integer,
  error          text
);

-- Live progress of the current/last run, for the Admin page.
create table if not exists run_progress (
  run_id     integer primary key,
  stage      text not null,      -- collecting | syncing | translating | done
  detail     text,
  updated_at text not null
);

create table if not exists sync_runs (
  id           integer primary key autoincrement,
  started_at   text not null,
  finished_at  text,
  status       text not null default 'running',   -- running | ok | error
  new_articles integer not null default 0,
  translated   integer not null default 0,
  tabs_deleted integer not null default 0,
  error        text
);

-- ---------------------------------------------------------------------------
-- Organising: stories, watchlists, saved items, muting
-- ---------------------------------------------------------------------------

-- "When" of an article for date filters and ordering: publish time, or fetch
-- time for undated items.
create index if not exists articles_when_idx on articles (coalesce(published_at, fetched_at) desc);

-- Stories: articles about the same event, clustered by local/stories.py.
create table if not exists stories (
  id            integer primary key autoincrement,
  title         text not null,          -- representative headline (English where available)
  first_seen    text not null,
  last_seen     text not null,
  article_count integer not null default 0,
  source_count  integer not null default 0,
  en_sources    integer not null default 0,   -- English-language outlets covering it
  kn_sources    integer not null default 0,   -- Kannada-language outlets
  hi_sources    integer not null default 0
);
create index if not exists stories_last_seen_idx on stories (last_seen desc);

create table if not exists article_story (
  article_id text primary key,
  story_id   integer not null
);
create index if not exists article_story_story_idx on article_story (story_id);

-- Watchlists: tracked keywords. terms = one phrase per line (aliases, both
-- scripts). fields = 'all' (headline, English headline, summary) or 'title'.
create table if not exists watchlists (
  id              integer primary key autoincrement,
  name            text not null,
  terms           text not null,
  fields          text not null default 'all',
  autosave_folder integer,              -- folders.id; new matches are saved there
  last_viewed_at  text,
  sort            integer not null default 100,
  created_at      text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Articles taken out of a watchlist by hand (they still match its terms).
create table if not exists watchlist_removed (
  watchlist_id integer not null references watchlists(id) on delete cascade,
  article_id   text not null,
  removed_at   text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  primary key (watchlist_id, article_id)
);

create table if not exists folders (
  id         integer primary key autoincrement,
  name       text not null unique,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create table if not exists saved_items (
  article_id text not null,
  folder_id  integer not null,
  note       text,
  saved_at   text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  saved_by   text not null default 'manual',   -- manual | watchlist:<id>
  primary key (article_id, folder_id)
);
create index if not exists saved_items_folder_idx on saved_items (folder_id, saved_at desc);

-- Muting moves matching articles out of every feed into the Muted section.
-- kind: phrase (matched in headline / English headline) | source | category
create table if not exists mute_rules (
  id         integer primary key autoincrement,
  kind       text not null,
  value      text not null,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  unique (kind, value)
);

create table if not exists app_state (
  key   text primary key,
  value text
);

-- Vocabulary of the search index (term, documents containing it), used for
-- "similar terms" suggestions (spelling variants that exist in the archive).
create virtual table if not exists articles_vocab using fts5vocab(articles_fts, 'row');

-- ---------------------------------------------------------------------------
-- Logs
-- ---------------------------------------------------------------------------

-- Every collector run (GitHub schedule / GitHub manual / this PC), copied from
-- the sheet's _runs tab. details = JSON per source: items in feed, new,
-- already had (dup), too old (old), ms, error.
create table if not exists collector_log (
  run_id       text primary key,
  started_at   text not null,
  finished_at  text,
  trigger      text,
  status       text,
  duration_ms  integer,
  sources      integer,
  failed       integer,
  new_articles integer,
  duplicates   integer,
  skipped_old  integer,
  tabs         text,
  details      text,
  url          text,
  error        text
);
create index if not exists collector_log_started_idx on collector_log (started_at desc);

-- Step-by-step log of each background run (sync_runs.id): everything the job
-- logs while it runs, with level and stage.
create table if not exists run_events (
  id      integer primary key autoincrement,
  run_id  integer not null,
  at      text not null,
  level   text not null,
  logger  text,
  message text not null
);
create index if not exists run_events_run_idx on run_events (run_id, id);

-- Topics tagged per article from its headline (local/topics.py), on top of
-- the source's own category — e.g. sports news from general outlets.
create table if not exists article_topics (
  article_id text not null,
  topic      text not null,
  primary key (article_id, topic)
);
create index if not exists article_topics_topic_idx on article_topics (topic);
-- Articles already checked by topics.py.
create table if not exists topic_scan (
  article_id text primary key
);
