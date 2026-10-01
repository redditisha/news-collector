/**
 * SQLite FTS5 query builders for search, watchlists and mute rules.
 * Watchlist matching mirrors local/watchrules.py (auto-save) — keep in step.
 *
 * The index covers the original headline, the English translation and the
 * summary, so an English term also finds Kannada/Hindi articles through
 * their translations.
 */

/** Strip characters FTS would treat as syntax; collapse whitespace. */
function clean(text: string): string {
  return text.replace(/["*^():{}]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * A phrase, prefix-matched on its last word ("Shivakumar" → "Shivakumar's").
 * A term typed with a trailing space matches whole words only:
 * "Tejaswi " finds "Tejaswi" but not "Tejaswin".
 */
export function phrase(term: string): string | null {
  const t = clean(term);
  if (!t) return null;
  return /\s$/.test(term) ? `"${t}"` : `"${t}"*`;
}

export type Fields = "all" | "title";

const inTitles = (q: string) => `{title title_en} : (${q})`;

/** Watchlist: any of its terms (one per line). */
export function watchlistQuery(terms: string, fields: Fields = "all"): string | null {
  const parts = terms.split(/\r?\n/).map(phrase).filter(Boolean) as string[];
  if (!parts.length) return null;
  const q = parts.join(" OR ");
  return fields === "title" ? inTitles(q) : q;
}

export type SearchMode = "all" | "any" | "phrase";

/**
 * Search box → FTS query.
 *  all    — every word, any order (default)
 *  any    — at least one word
 *  phrase — the exact words in order
 * Words are prefix-matched, so "rain" also finds "rains" / "rainfall".
 * extra: additional terms picked from "similar terms" (OR-ed with the query).
 */
export function searchQuery(q: string, mode: SearchMode = "all", extra: string[] = [], fields: Fields = "all"): string | null {
  const text = clean(q);
  let base: string | null = null;
  if (text) {
    if (mode === "phrase") base = `"${text}"`;
    else {
      const words = text.split(" ").map((w) => `"${w}"*`);
      base = words.join(mode === "any" ? " OR " : " AND ");
    }
  }
  const alts = extra.map(phrase).filter(Boolean) as string[];
  const all = [base ? `(${base})` : null, ...alts].filter(Boolean) as string[];
  if (!all.length) return null;
  const query = all.join(" OR ");
  return fields === "title" ? inTitles(query) : query;
}

/** Mute phrases match headlines only (original or English), not summaries. */
export function mutePhraseQuery(phrases: string[]): string | null {
  const parts = phrases.map(phrase).filter(Boolean) as string[];
  return parts.length ? inTitles(parts.join(" OR ")) : null;
}

/** Phrases picked in the phrase panel: all must appear, in headlines or anywhere. */
export function phrasePanelQuery(phrases: string[], fields: Fields = "title"): string | null {
  const parts = phrases.map(clean).filter(Boolean).map((t) => `"${t}"`);
  if (!parts.length) return null;
  const q = parts.join(" AND ");
  return fields === "title" ? inTitles(q) : q;
}
