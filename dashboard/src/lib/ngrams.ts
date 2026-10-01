import { db } from "@/lib/db";

/**
 * Phrase analysis over headlines: n-grams (Browse), trending phrases (Today)
 * and search suggestions. Adapted from DeepFeed's n-gram tool, with news
 * signals in place of YouTube views: how many different outlets use a phrase.
 */

export type TextField = "en" | "original" | "summary";

export interface TextRow {
  title: string;
  title_en: string | null;
  description: string | null;
  language: string;
  source_id: string;
}

export const STOPWORDS = new Set(
  `a about above after again against all also am an and any are as at be because been before being below between
  both but by can could did do does doing down during each few for from further had has have having he her here hers
  him his how i if in into is it its itself just me more most my no nor not now of off on once only or other our out
  over own same she should so some such than that the their them then there these they this those through to too
  under until up very was we were what when where which while who whom why will with would you your yours
  says said say amid ahead via vs new news live latest updates update breaking watch video videos photos photo today
  know here details check read full list report reports day days top big also just get gets got one two three
  first last next week year years time times make made makes like how what's it's don't won't can't`.split(/\s+/)
);

// Kannada/Hindi function words. Kannada attaches case endings with a
// zero-width joiner (ಶಿವಕುಮಾರ್‌ಗೆ), which splits "ಗೆ", "ನಲ್ಲಿ"… off as words.
const INDIC_STOPWORDS = new Set(
  `ಗೆ ಕ್ಕೆ ಗೂ ಲ್ಲಿ ನಲ್ಲಿ ದಲ್ಲಿ ಯಲ್ಲಿ ರಲ್ಲಿ ನ ದ ರ ಯ ಅವರ ಅವರು ಮತ್ತು ಈ ಆ ಒಂದು ಬಗ್ಗೆ ಇಂದು ಈಗ ಏನು ಹೇಗೆ ಯಾಕೆ ಇದು ಅದು
  ಎಂದು ಆದರೆ ಮೇಲೆ ಜೊತೆ ಹಾಗೂ ಸೇರಿ ನೋಡಿ ಇಲ್ಲಿದೆ ಇಲ್ಲ ಇದೆ ಹೊಸ ದಿನ ಬಳಿ ನಂತರ ಮುನ್ನ ವೇಳೆ ಕುರಿತು
  का की के में है हैं से को और पर ने एक यह वह भी लिए नहीं तो ही था थी थे कि जो कर गया गई हुआ अब`.split(/\s+/)
);
const KANNADA_OR_DEVANAGARI = /[ऀ-ॿಀ-೿]/;
/** Too short to mean anything on its own: a split-off Indic suffix. */
const isIndicFragment = (w: string) => KANNADA_OR_DEVANAGARI.test(w) && [...w].length < 3;
const isStop = (w: string) => STOPWORDS.has(w) || INDIC_STOPWORDS.has(w) || isIndicFragment(w);

/** The text of a row for the chosen field. */
export function textOf(r: TextRow, field: TextField): string {
  if (field === "summary") return r.description || "";
  if (field === "original") return r.title;
  return r.language === "en" || !r.title_en ? (r.language === "en" ? r.title : "") : r.title_en;
}

/** Words of a text: lowercase, letters/digits (any script), apostrophes dropped. */
export function words(text: string): string[] {
  return (
    text
      .toLowerCase()
      .replace(/[’']/g, "")
      .match(/[\p{L}\p{M}\p{N}]+/gu) || []
  ).filter((w) => w.length >= 2 || /\d/.test(w));
}

function grams(ws: string[], n: number, dropStop: boolean): string[] {
  const out: string[] = [];
  for (let i = 0; i + n <= ws.length; i++) {
    const g = ws.slice(i, i + n);
    // A phrase may not start or end with a stop word ("of the", "in bengaluru").
    if (dropStop && (isStop(g[0]) || isStop(g[n - 1]))) continue;
    if (g.every((w) => /^\d+$/.test(w))) continue;
    out.push(g.join(" "));
  }
  return out;
}

export interface NgramRow {
  ngram: string;
  articles: number; // articles using it
  sources: number;  // distinct outlets using it
}

export function computeNgrams(
  rows: TextRow[],
  opts: { field: TextField; n: number; stopwords: boolean; minCount: number; by: "articles" | "sources"; limit?: number }
): NgramRow[] {
  const acc = new Map<string, { articles: number; sources: Set<string> }>();
  for (const r of rows) {
    const text = textOf(r, opts.field);
    if (!text) continue;
    const seen = new Set(grams(words(text), opts.n, opts.stopwords)); // count once per article
    for (const g of seen) {
      let e = acc.get(g);
      if (!e) acc.set(g, (e = { articles: 0, sources: new Set() }));
      e.articles++;
      e.sources.add(r.source_id);
    }
  }
  const key = (e: NgramRow) => (opts.by === "sources" ? e.sources : e.articles);
  return [...acc]
    .map(([ngram, e]) => ({ ngram, articles: e.articles, sources: e.sources.size }))
    .filter((e) => key(e) >= opts.minCount)
    .sort((a, b) => key(b) - key(a) || b.articles - a.articles)
    .slice(0, opts.limit ?? 150);
}

/**
 * Trending phrases: 1–3 word phrases used by several outlets recently that
 * are much more common now than over the baseline period. English headlines
 * (translations for Kannada/Hindi) so both languages count together.
 */
export function trendingPhrases(recent: TextRow[], baseline: TextRow[], opts = { minSources: 3, limit: 12 }) {
  // phrase -> outlets using it, and (recent only) which articles
  const count = (rows: TextRow[], withDocs: boolean) => {
    const m = new Map<string, { sources: Set<string>; docs: Set<number> }>();
    rows.forEach((r, i) => {
      const ws = words(textOf(r, "en"));
      const seen = new Set([...grams(ws, 1, true), ...grams(ws, 2, true), ...grams(ws, 3, true)]);
      for (const g of seen) {
        let e = m.get(g);
        if (!e) m.set(g, (e = { sources: new Set(), docs: new Set() }));
        e.sources.add(r.source_id);
        if (withDocs) e.docs.add(i);
      }
    });
    return m;
  };
  const now = count(recent, true);
  const base = count(baseline, false);
  const baseTotal = Math.max(baseline.length, 1);
  const recentTotal = Math.max(recent.length, 1);
  const scored = [...now]
    .filter(([g, e]) => e.sources.size >= opts.minSources && g.length > 2)
    .map(([g, e]) => {
      const recentRate = e.sources.size / recentTotal;
      const baseRate = ((base.get(g)?.sources.size ?? 0) + 1) / baseTotal; // +1 smoothing
      const lift = recentRate / baseRate;
      // Multi-word phrases name events ("milk price hike"); single words are
      // mostly generic ("india", "police"), so they count for half.
      const score = e.sources.size * Math.log2(lift) * (g.includes(" ") ? 1 : 0.5);
      return { phrase: g, sources: e.sources.size, lift, score, docs: e.docs };
    })
    .filter((x) => x.lift >= 3)
    .sort((a, b) => b.score - a.score);

  // One phrase per story: skip a phrase when most of its articles already
  // belong to a higher-ranked phrase ("surgical strikes" vs "counter terrorism").
  const picked: typeof scored = [];
  for (const x of scored) {
    const overlaps = picked.some((p) => {
      let shared = 0;
      for (const d of x.docs) if (p.docs.has(d)) shared++;
      return shared / x.docs.size >= 0.5;
    });
    if (overlaps) continue;
    picked.push(x);
    if (picked.length >= opts.limit) break;
  }
  return picked.map(({ phrase, sources, lift }) => ({ phrase, sources, lift }));
}

// ---------------------------------------------------------------------------
// Search suggestions
// ---------------------------------------------------------------------------

function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/**
 * Spelling variants of the query's words that exist in the archive
 * ("shivkumar" → "shivakumar", "bangalore" ↔ "bengaluru" is not a spelling
 * variant and won't appear here). Words already covered by prefix matching
 * are skipped.
 */
export function similarTerms(q: string, limit = 8): { term: string; docs: number }[] {
  const out = new Map<string, number>();
  for (const w of words(q)) {
    if (w.length < 4) continue;
    const max = w.length <= 6 ? 1 : 2;
    const candidates = db()
      .prepare("select term, doc from articles_vocab where term >= ? and term < ? and doc >= 2")
      .all(w.slice(0, 1), w.slice(0, 1) + "￿") as { term: string; doc: number }[];
    for (const c of candidates) {
      if (c.term === w || c.term.startsWith(w)) continue;
      if (Math.abs(c.term.length - w.length) > max) continue;
      if (editDistance(w, c.term, max) <= max) out.set(c.term, Math.max(out.get(c.term) ?? 0, c.doc));
    }
  }
  return [...out].map(([term, docs]) => ({ term, docs })).sort((a, b) => b.docs - a.docs).slice(0, limit);
}

/** Words that show up unusually often in the results compared to the whole archive. */
export function relatedTerms(results: TextRow[], q: string, limit = 10): string[] {
  if (results.length < 3) return [];
  const qWords = new Set(words(q));
  const counts = new Map<string, number>();
  for (const r of results) {
    for (const w of new Set(words(textOf(r, "en") || r.title))) {
      if (STOPWORDS.has(w) || qWords.has(w) || w.length < 3 || /^\d+$/.test(w) || KANNADA_OR_DEVANAGARI.test(w)) continue;
      counts.set(w, (counts.get(w) ?? 0) + 1);
    }
  }
  const total = (db().prepare("select count(*) as n from articles").get() as { n: number }).n || 1;
  const docFreq = db().prepare("select doc from articles_vocab where term = ?");
  return [...counts]
    .filter(([, c]) => c >= 2)
    .map(([w, c]) => {
      const df = (docFreq.get(w) as { doc: number } | undefined)?.doc ?? c;
      return { w, score: (c / results.length) * Math.log(total / df) };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.w);
}
