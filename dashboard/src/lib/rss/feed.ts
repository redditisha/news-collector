import Parser from "rss-parser";

// Plain browser headers. A custom UA token or an rss-specific Accept header
// trips some publisher WAFs (e.g. Gadgets 360 403s on `Accept: application/rss+xml`),
// so we present as an ordinary browser and fetch the bytes ourselves.
const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/125.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9,kn;q=0.8,hi;q=0.7",
};

const FETCH_TIMEOUT_MS = 15000;

function makeParser() {
  return new Parser({
    customFields: {
      item: [
        ["media:content", "media:content"],
        ["media:thumbnail", "media:thumbnail"],
        ["media:group", "media:group"],
        ["content:encoded", "content:encoded"],
        ["dc:creator", "dc:creator"],
      ],
    },
  });
}

/** Fetch feed bytes with browser headers + a hard timeout. */
async function fetchFeedText(url: string): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: BROWSER_HEADERS,
      redirect: "follow",
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`Status code ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Make real-world feed XML parseable by a strict parser:
 *  - strip a UTF-8 BOM and XML-illegal control characters
 *  - drop the optional channel <image> block, which publishers (e.g. Ee Dina)
 *    frequently emit with an unclosed <link>, breaking the whole document
 */
function sanitizeXml(xml: string): string {
  return xml
    .replace(/^\uFEFF/, "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/<image>[\s\S]*?<\/image>/gi, "");
}

/** Fetch + sanitize + parse one feed into items. */
async function fetchAndParse(url: string, parser: Parser) {
  const text = sanitizeXml(await fetchFeedText(url));
  return parser.parseString(text);
}

/** Validate a single RSS URL without storing anything (Admin "Test feed"). */
export async function testFeed(url: string) {
  const parser = makeParser();
  try {
    const feed = await fetchAndParse(url, parser);
    return {
      ok: true,
      title: feed.title || null,
      items: feed.items?.length ?? 0,
      sample: feed.items?.slice(0, 3).map((i) => i.title) ?? [],
    };
  } catch (e: any) {
    return { ok: false, error: (e?.message || String(e)).slice(0, 500) };
  }
}
