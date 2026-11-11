import { convert } from "html-to-text";

export type FetchedPage =
  | { ok: true; url: string; finalUrl: string; title: string; text: string; truncated: boolean; chars: number }
  | { ok: false; url: string; reason: string };

const MAX_BYTES = 2_000_000;
export const MAX_CHARS = 30_000;
const UA = "oauth-fieldguide/0.1 (+research tool; reads public documentation)";

/**
 * The model chooses which URLs to read, so treat them as untrusted: public https hosts only.
 * This blocks the obvious SSRF targets (localhost, IP literals, internal names).
 */
export function checkUrl(raw: string): { ok: true; url: URL } | { ok: false; reason: string } {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "not a valid URL" };
  }
  if (url.protocol !== "https:") return { ok: false, reason: "only https URLs are fetched" };
  if (url.username || url.password) return { ok: false, reason: "URLs with credentials are not fetched" };
  if (url.port && url.port !== "443") return { ok: false, reason: "non-standard ports are not fetched" };
  const host = url.hostname.toLowerCase();
  if (!host.includes(".")) return { ok: false, reason: "host is not a public domain" };
  if (/^[0-9.]+$/.test(host) || host.includes(":") || host.startsWith("["))
    return { ok: false, reason: "IP-literal hosts are not fetched" };
  if (/(^|\.)(localhost|local|internal|lan|home|corp|test|invalid|example)$/.test(host))
    return { ok: false, reason: "host is not a public domain" };
  return { ok: true, url };
}

export function htmlToText(html: string): { title: string; text: string } {
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "")
    .replace(/\s+/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .trim();
  const text = convert(html, {
    wordwrap: false,
    baseElements: { selectors: ["main", "article", "[role=main]", "body"], returnDomByDefault: true },
    selectors: [
      { selector: "nav", format: "skip" },
      { selector: "header", format: "skip" },
      { selector: "footer", format: "skip" },
      { selector: "aside", format: "skip" },
      { selector: "script", format: "skip" },
      { selector: "style", format: "skip" },
      { selector: "svg", format: "skip" },
      { selector: "img", format: "skip" },
      { selector: "form", format: "skip" },
      { selector: "a", options: { ignoreHref: false, hideLinkHrefIfSameAsText: true, noAnchorUrl: true } },
      { selector: "h1", options: { uppercase: false } },
      { selector: "h2", options: { uppercase: false } },
      { selector: "h3", options: { uppercase: false } },
      { selector: "h4", options: { uppercase: false } },
      { selector: "table", format: "dataTable", options: { uppercaseHeaderCells: false } },
    ],
  })
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { title, text };
}

export async function fetchPage(rawUrl: string, fetchImpl: typeof fetch = fetch): Promise<FetchedPage> {
  let current = rawUrl;
  try {
    for (let hop = 0; hop < 5; hop++) {
      const checked = checkUrl(current);
      if (!checked.ok) return { ok: false, url: rawUrl, reason: checked.reason };
      const res = await fetchImpl(checked.url, {
        redirect: "manual",
        headers: { "user-agent": UA, accept: "text/html,text/markdown,text/plain;q=0.9,*/*;q=0.5", "accept-language": "en" },
        signal: AbortSignal.timeout(15000),
      });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        await res.body?.cancel().catch(() => {});
        if (!loc) return { ok: false, url: rawUrl, reason: `HTTP ${res.status} without a Location header` };
        current = new URL(loc, checked.url).toString();
        continue;
      }
      if (!res.ok) {
        await res.body?.cancel().catch(() => {});
        return { ok: false, url: rawUrl, reason: `HTTP ${res.status}` };
      }
      const type = res.headers.get("content-type") ?? "";
      if (!/text\/|application\/(xhtml|json|xml)/i.test(type)) {
        await res.body?.cancel().catch(() => {});
        return { ok: false, url: rawUrl, reason: `unsupported content type ${type || "(none)"}` };
      }
      const raw = await readCapped(res, MAX_BYTES);
      const isHtml = /html/i.test(type) || /^\s*<(!doctype|html)/i.test(raw);
      const { title, text } = isHtml
        ? htmlToText(raw)
        : { title: raw.match(/^# (.+)$/m)?.[1]?.trim() ?? "", text: raw.replace(/^---[\s\S]*?---\s*/, "").trim() };
      if (text.length < 300) {
        return {
          ok: false,
          url: rawUrl,
          reason: `page returned almost no readable text (${text.length} characters); it is probably rendered client-side or behind a login`,
        };
      }
      const truncated = text.length > MAX_CHARS;
      const body = truncated ? text.slice(0, MAX_CHARS) : text;
      return {
        ok: true,
        url: rawUrl,
        finalUrl: checked.url.toString(),
        title: title || checked.url.hostname + checked.url.pathname,
        text: body,
        truncated,
        chars: body.length,
      };
    }
    return { ok: false, url: rawUrl, reason: "too many redirects" };
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    const reason = name === "TimeoutError" || name === "AbortError" ? "timed out after 15s" : `network error: ${err instanceof Error ? err.message : String(err)}`;
    return { ok: false, url: rawUrl, reason };
  }
}

async function readCapped(res: Response, maxBytes: number): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let out = "";
  let bytes = 0;
  while (bytes < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    out += decoder.decode(value, { stream: true });
  }
  await reader.cancel().catch(() => {});
  return out;
}
