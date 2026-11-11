/**
 * Live Composio metadata, read from Composio's public documentation (no API key needed).
 *
 * - The managed-auth catalogue lists every OAuth toolkit under "Composio-managed OAuth available"
 *   or "Bring your own OAuth app".
 * - Each toolkit page states its auth schemes and "Composio-managed OAuth available? Yes/No".
 *
 * The authenticated endpoint (GET /api/v3.1/toolkits/{slug} -> composio_managed_auth_schemes) is the
 * canonical source; if COMPOSIO_API_KEY is set we could use it, but the public pages carry the same
 * answer and let an evaluator run this without a Composio account.
 */

export const DOCS_ORIGIN = "https://docs.composio.dev";
export const CATALOGUE_URL = `${DOCS_ORIGIN}/toolkits/managed-auth.md`;
export const MANAGED_VS_CUSTOM_URL = `${DOCS_ORIGIN}/docs/authentication/custom-app-vs-managed-app.md`;

export type CatalogueEntry = { name: string; slug: string; pageSlug: string; list: "managed" | "byo" };
export type Catalogue = { entries: CatalogueEntry[]; fetchedAt: string; raw: string };

export type ToolkitHead = {
  url: string;
  name: string;
  description: string;
  category: string | null;
  authSchemes: string[];
  managedOAuth: boolean | null;
  slug: string | null;
  faq: { question: string; answer: string }[];
  /** The text that was actually read (header + FAQ), kept so quotes can be checked against it. */
  text: string;
};

export function parseCatalogue(markdown: string): CatalogueEntry[] {
  const entries: CatalogueEntry[] = [];
  let list: "managed" | "byo" | null = null;
  for (const line of markdown.split("\n")) {
    if (line.startsWith("## ")) {
      const h = line.toLowerCase();
      if (h.includes("composio-managed oauth available")) list = "managed";
      else if (h.includes("bring your own oauth app")) list = "byo";
      else list = null;
      continue;
    }
    if (!list) continue;
    const m = line.match(/^\|\s*\[([^\]]+)\]\(\/toolkits\/([a-z0-9_\-]+)\.md\)\s*\|\s*`([A-Z0-9_\-]+)`\s*\|/i);
    if (m) entries.push({ name: m[1].trim(), pageSlug: m[2], slug: m[3], list });
  }
  return entries;
}

export function parseToolkitHead(markdown: string, url: string): ToolkitHead {
  const cut = markdown.search(/\n## Tools\b/);
  const body = (cut === -1 ? markdown : markdown.slice(0, cut)).replace(/^---[\s\S]*?---\s*/, "");
  const name = body.match(/^# (.+)$/m)?.[1].trim() ?? "";
  const afterTitle = body.slice(body.indexOf("\n", body.indexOf("# ")) + 1);
  const description = afterTitle.split(/\n- \*\*/)[0].trim();
  const field = (label: string) =>
    body.match(new RegExp(`^- \\*\\*${label}\\*\\*\\s*(.+)$`, "m"))?.[1].trim() ?? null;
  const auth = field("Auth:");
  const managedRaw = field("Composio-managed OAuth available\\?");
  const managedOAuth = managedRaw == null ? null : /^yes\b/i.test(managedRaw) ? true : /^no\b/i.test(managedRaw) ? false : null;

  const faq: { question: string; answer: string }[] = [];
  const faqStart = body.search(/\n## Frequently Asked Questions/);
  if (faqStart !== -1) {
    const faqBody = body.slice(faqStart).replace(/\n## Frequently Asked Questions\s*/, "\n");
    for (const part of faqBody.split(/\n### /).slice(1)) {
      const nl = part.indexOf("\n");
      const question = (nl === -1 ? part : part.slice(0, nl)).trim();
      const answer = (nl === -1 ? "" : part.slice(nl + 1)).split(/\n## /)[0].trim();
      if (question) faq.push({ question, answer });
    }
  }

  return {
    url,
    name,
    description,
    category: field("Category:"),
    authSchemes: auth ? auth.split(",").map((s) => s.trim()).filter(Boolean) : [],
    managedOAuth,
    slug: field("Slug:")?.replace(/`/g, "") ?? null,
    faq,
    text: body.trim(),
  };
}

/** FAQ entries that bear on OAuth app setup, review, scopes or branding (the rest is tool usage noise). */
export function relevantFaq(faq: ToolkitHead["faq"]): ToolkitHead["faq"] {
  const re = /oauth|credential|scope|consent|verif|approv|review|marketplace|redirect|blocked|app not found|install|owner|admin|quota|rate limit|github app/i;
  return faq
    .filter((f) => re.test(f.question) || re.test(f.answer.slice(0, 400)))
    .slice(0, 8)
    .map((f) => ({ question: f.question, answer: f.answer.length > 700 ? f.answer.slice(0, 700).trimEnd() + "…" : f.answer }));
}

export function customGuideUrl(head: ToolkitHead): string | null {
  return head.text.match(/https:\/\/composio\.dev\/auth\/[a-z0-9_\-]+/i)?.[0] ?? null;
}

const UA = "oauth-fieldguide/0.1 (+research tool; reads public documentation)";
let catalogueCache: { at: number; value: Catalogue } | null = null;
const CATALOGUE_TTL = 60 * 60 * 1000;

export async function fetchCatalogue(fetchImpl: typeof fetch = fetch): Promise<Catalogue> {
  if (catalogueCache && Date.now() - catalogueCache.at < CATALOGUE_TTL) return catalogueCache.value;
  const res = await fetchImpl(CATALOGUE_URL, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Composio catalogue returned HTTP ${res.status}`);
  const raw = await res.text();
  const entries = parseCatalogue(raw);
  if (entries.length < 50) throw new Error(`Composio catalogue format changed: parsed only ${entries.length} toolkits`);
  const value = { entries, fetchedAt: new Date().toISOString(), raw };
  catalogueCache = { at: Date.now(), value };
  return value;
}

/**
 * Toolkit pages are large (GitHub's is 1.2 MB of tool listings) and the server ignores Range,
 * so read the stream only until the "## Tools" heading and then cancel it.
 */
export async function fetchToolkitHead(pageSlug: string, fetchImpl: typeof fetch = fetch): Promise<ToolkitHead | null> {
  const url = `${DOCS_ORIGIN}/toolkits/${pageSlug}.md`;
  const res = await fetchImpl(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(15000) });
  if (res.status === 404) {
    await res.body?.cancel().catch(() => {});
    return null;
  }
  if (!res.ok || !res.body) throw new Error(`Composio toolkit page returned HTTP ${res.status}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  const LIMIT = 200_000;
  while (text.length < LIMIT) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
    if (/\n## Tools\b/.test(text)) break;
  }
  await reader.cancel().catch(() => {});
  if (!/^# /m.test(text)) return null;
  return parseToolkitHead(text, url.replace(/\.md$/, ""));
}
