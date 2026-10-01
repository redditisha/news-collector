import Database from "better-sqlite3";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { HOSTED } from "@/lib/mode";

/**
 * The local SQLite archive (server only). Same file and schema as the
 * background jobs in local/ — they write articles and translations, the app
 * reads them and manages sources. WAL mode lets both run at once.
 */
const ROOT = process.cwd();

export function dbPath(): string {
  const p = process.env.NEWS_DB_PATH || "data/news.db";
  return path.isAbsolute(p) ? p : path.join(ROOT, p);
}

export const newSourceId = () => crypto.randomBytes(5).toString("hex");

function open(): Database.Database {
  if (HOSTED) {
    // Hosted dashboard: an in-memory copy filled from the Google Sheet
    // (lib/sheetdata.ts). Categories come from the bundled seed file.
    const mem = new Database(":memory:");
    mem.exec(fs.readFileSync(path.join(ROOT, "local", "schema.sql"), "utf8"));
    // Day tabs are loaded in bulk and indexed for search in one statement
    // afterwards (lib/sheetdata.ts) — about twice as fast as row by row.
    mem.exec("drop trigger if exists articles_fts_ai");
    seed(mem, false);
    return mem;
  }
  const file = dbPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma("busy_timeout = 30000");
  db.exec(fs.readFileSync(path.join(ROOT, "local", "schema.sql"), "utf8"));
  if ((db.prepare("select count(*) as n from sources").get() as { n: number }).n === 0) seed(db);
  return db;
}

/** First run: load the bundled source list and categories. */
function seed(db: Database.Database, withSources = true) {
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, "local", "seed_sources.json"), "utf8"));
  const addCategory = db.prepare(
    'insert or ignore into categories (slug, "group", name, sort) values (@slug, @group, @name, @sort)'
  );
  const addSource = db.prepare(
    `insert or ignore into sources (id, name, rss_url, language, country, region, category_group,
       primary_category, secondary_category, source_type, priority)
     values (@id, @name, @rss_url, @language, @country, @region, @category_group,
       @primary_category, @secondary_category, @source_type, @priority)`
  );
  db.transaction(() => {
    data.categories.forEach((c: any) => addCategory.run(c));
    if (withSources) data.sources.forEach((s: any) => addSource.run({ ...s, id: newSourceId() }));
  })();
}

// Reuse one connection across hot reloads in dev.
const g = globalThis as unknown as { __newsDb?: Database.Database };
export function db(): Database.Database {
  if (!g.__newsDb) g.__newsDb = open();
  return g.__newsDb;
}
