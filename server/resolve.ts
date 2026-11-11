import type { CatalogueEntry } from "./composio.ts";

export type Resolution = {
  /** Catalogue entry chosen, if the query matched a Composio OAuth toolkit. */
  match: CatalogueEntry | null;
  /** How confident the match is; "none" means we fall back to trying a toolkit page by slug. */
  confidence: "exact" | "close" | "none";
  /** Shown to the user whenever the match was not exact. */
  note: string | null;
  alternatives: CatalogueEntry[];
  /** Slugs worth trying directly on docs.composio.dev when the OAuth catalogue has no match. */
  slugGuesses: string[];
  displayName: string;
};

export const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

/** Common names people type that differ from Composio's toolkit name. Kept deliberately small. */
const ALIASES: Record<string, string> = {
  googlemail: "gmail",
  gcal: "googlecalendar",
  gdrive: "googledrive",
  msteams: "microsoftteams",
  teams: "microsoftteams",
  twitter: "x",
  o365: "office365",
};

const isVariant = (e: CatalogueEntry) => /_MCP$|MCP$/i.test(e.slug) || /\bMCP\b/i.test(e.name);

export function resolveProvider(rawQuery: string, entries: CatalogueEntry[]): Resolution {
  const query = rawQuery.trim().replace(/\s+/g, " ");
  const explicit = query.match(/^slug:([a-z0-9_\-]+)$/i);
  if (explicit) {
    const wanted = explicit[1].toUpperCase();
    const match = entries.find((e) => e.slug === wanted || e.pageSlug === explicit[1].toLowerCase()) ?? null;
    return {
      match,
      confidence: match ? "exact" : "none",
      note: null,
      alternatives: [],
      slugGuesses: match ? [] : [explicit[1].toLowerCase()],
      displayName: match?.name ?? explicit[1],
    };
  }

  const k0 = key(query);
  const k = ALIASES[k0] ?? k0;
  const aliasNote = ALIASES[k0] ? `"${query}" was read as the Composio toolkit "${ALIASES[k0]}".` : null;

  const exact = entries.filter((e) => key(e.name) === k || key(e.slug) === k || key(e.pageSlug) === k);
  if (exact.length) {
    const match = exact.find((e) => !isVariant(e)) ?? exact[0];
    const variants = entries.filter((e) => e !== match && key(e.name).startsWith(k)).slice(0, 5);
    return {
      match,
      confidence: "exact",
      note: aliasNote,
      alternatives: variants,
      slugGuesses: [],
      displayName: match.name,
    };
  }

  const scored = entries
    .map((e) => {
      const n = key(e.name);
      const s = key(e.slug);
      let score = 0;
      if (k.length >= 3 && (n.startsWith(k) || s.startsWith(k))) score = 80 - Math.min(30, n.length - k.length);
      else if (k.length >= 4 && (n.includes(k) || s.includes(k))) score = 55 - Math.min(20, n.length - k.length);
      else if (n.length >= 4 && k.includes(n)) score = 50;
      else if (k.length >= 5 && editDistance(k, n) <= 1) score = 60;
      if (score && isVariant(e)) score -= 10;
      return { e, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.e.name.length - b.e.name.length);

  if (scored.length) {
    const match = scored[0].e;
    const alternatives = scored.slice(1, 6).map((x) => x.e);
    const note =
      `"${query}" is not an exact Composio toolkit name. Assumed you mean ${match.name}` +
      (alternatives.length ? `; other matches: ${alternatives.map((a) => a.name).join(", ")}.` : ".");
    return { match, confidence: "close", note, alternatives, slugGuesses: [], displayName: match.name };
  }

  const underscored = query.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  return {
    match: null,
    confidence: "none",
    note: null,
    alternatives: [],
    slugGuesses: [...new Set([k, underscored])].filter(Boolean),
    displayName: query,
  };
}

function editDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 99;
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}
