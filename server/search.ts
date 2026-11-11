/**
 * Keyless web search for the research agent.
 *
 * No search API key is required: this reads the public HTML results pages of Brave Search and
 * DuckDuckGo. That is the fragile part of the system, so it is handled openly:
 * - engines are tried in order, and a bot-challenge page counts as a failure, not as "no results";
 * - every attempt is reported to the UI and the investigation log, including failures;
 * - results are leads only. Nothing becomes evidence until fetch_page retrieves the page itself.
 */

export type SearchResult = { title: string; url: string; snippet: string };
export type SearchOutcome =
  | { ok: true; engine: string; results: SearchResult[] }
  | { ok: false; reason: string; attempts: string[] };

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const MAX_RESULTS = 8;
const CHALLENGE_RE = /captcha|anomaly|unusual traffic|are you a robot|challenge-form|verify you are human/i;

const decodeEntities = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&nbsp;/g, " ")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/&hellip;/g, "…")
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));

const stripTags = (s: string) => decodeEntities(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

function dedupe(results: SearchResult[]): SearchResult[] {
  const seen = new Set<string>();
  const out: SearchResult[] = [];
  for (const r of results) {
    const k = r.url.replace(/[#?].*$/, "").replace(/\/$/, "");
    if (!/^https?:\/\//.test(r.url) || seen.has(k)) continue;
    seen.add(k);
    out.push(r);
    if (out.length >= MAX_RESULTS) break;
  }
  return out;
}

export function parseBrave(html: string): SearchResult[] {
  const blocks = html.split(/<div class="snippet[^"]*"[^>]*data-type="web"/).slice(1);
  const results: SearchResult[] = [];
  for (const raw of blocks) {
    const b = raw.slice(0, 12000);
    const url = [...b.matchAll(/<a href="(https?:\/\/[^"]+)"/g)].map((m) => decodeEntities(m[1])).find((u) => !/(^https?:\/\/[^/]*\.?brave\.com)/.test(u));
    const title = b.match(/class="title[^"]*"[^>]*title="([^"]+)"/)?.[1] ?? b.match(/class="title[^"]*"[^>]*>([\s\S]*?)<\/div>/)?.[1];
    if (!url || !title) continue;
    const contentStart = b.search(/<div class="content[^"]*"/);
    const snippet = contentStart === -1 ? "" : stripTags(b.slice(contentStart, contentStart + 2500)).slice(0, 300);
    results.push({ url, title: stripTags(title), snippet });
  }
  return dedupe(results);
}

export function parseDuckDuckGo(html: string): SearchResult[] {
  const results: SearchResult[] = [];
  const re = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>([\s\S]*?)(?=<a[^>]*class="result__a"|$)/g;
  for (const m of html.matchAll(re)) {
    let href = decodeEntities(m[1]);
    const uddg = href.match(/[?&]uddg=([^&]+)/);
    if (uddg) href = decodeURIComponent(uddg[1]);
    else if (href.startsWith("//")) href = `https:${href}`;
    if (/duckduckgo\.com\/y\.js|[?&]ad_domain=/.test(href)) continue; // ads
    const snippet = m[3].match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/)?.[1] ?? "";
    results.push({ url: href, title: stripTags(m[2]), snippet: stripTags(snippet).slice(0, 300) });
  }
  return dedupe(results);
}

type Engine = { name: string; url: (q: string) => string; parse: (html: string) => SearchResult[] };

export const ENGINES: Engine[] = [
  { name: "DuckDuckGo", url: (q) => `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`, parse: parseDuckDuckGo },
  { name: "Brave Search", url: (q) => `https://search.brave.com/search?q=${encodeURIComponent(q)}&source=web`, parse: parseBrave },
];

// Be polite to the engines and keep repeat queries cheap.
const lastHit = new Map<string, number>();
const MIN_GAP_MS = 1200;
/** An engine that blocks us is skipped for a while instead of being asked again on every query. */
const cooldownUntil = new Map<string, number>();
const COOLDOWN_MS = 10 * 60 * 1000;
export function resetSearchState() {
  lastHit.clear();
  cooldownUntil.clear();
  cache.clear();
}
const cache = new Map<string, { at: number; outcome: SearchOutcome & { ok: true } }>();
const CACHE_MS = 60 * 60 * 1000;

export async function searchWeb(query: string, fetchImpl: typeof fetch = fetch, engines: Engine[] = ENGINES): Promise<SearchOutcome> {
  const q = query.trim().replace(/\s+/g, " ").slice(0, 200);
  const hit = cache.get(q.toLowerCase());
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.outcome;

  const attempts: string[] = [];
  for (const engine of engines) {
    const cooling = (cooldownUntil.get(engine.name) ?? 0) - Date.now();
    if (cooling > 0) {
      attempts.push(`${engine.name}: skipped, blocked us ${Math.round((COOLDOWN_MS - cooling) / 60000)} min ago`);
      continue;
    }
    const wait = (lastHit.get(engine.name) ?? 0) + MIN_GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastHit.set(engine.name, Date.now());
    try {
      const res = await fetchImpl(engine.url(q), {
        headers: { "user-agent": UA, accept: "text/html", "accept-language": "en-US,en;q=0.8" },
        signal: AbortSignal.timeout(12000),
      });
      const html = await res.text();
      if (!res.ok) {
        if (res.status === 429 || res.status === 403 || res.status === 202) cooldownUntil.set(engine.name, Date.now() + COOLDOWN_MS);
        attempts.push(`${engine.name}: HTTP ${res.status}${res.status === 429 ? " (rate limited)" : ""}`);
        continue;
      }
      const results = engine.parse(html);
      if (results.length) {
        const outcome = { ok: true as const, engine: engine.name, results };
        cache.set(q.toLowerCase(), { at: Date.now(), outcome });
        return outcome;
      }
      const blocked = CHALLENGE_RE.test(html);
      if (blocked) cooldownUntil.set(engine.name, Date.now() + COOLDOWN_MS);
      attempts.push(`${engine.name}: ${blocked ? "blocked by a bot check" : "no results parsed"}`);
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      attempts.push(`${engine.name}: ${name === "TimeoutError" || name === "AbortError" ? "timed out" : "network error"}`);
    }
  }
  return { ok: false, reason: attempts.join("; "), attempts };
}
