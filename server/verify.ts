import { eachClaim, type Adjustment, type Claim, type Guide, type GuideDraft } from "../shared/schema.ts";

export type VerifySource = { id: string; url: string; text: string };

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/\[https?:\/\/[^\]\s]+\]/g, " ") // link targets html-to-text appends after anchor text
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[‐-―]/g, "-")
    .replace(/[*_`#>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Is the quote present in the page? Exact match after normalisation, or, to tolerate text that the
 * HTML conversion split with link targets or table cells, at least 80% of the quote's 5-word
 * shingles must occur in the page.
 */
export function quoteFound(quote: string, pageText: string): boolean {
  const q = norm(quote).replace(/^["'\s]+|["'\s.…]+$/g, "");
  if (q.length < 12) return false;
  const page = norm(pageText);
  if (page.includes(q)) return true;
  const words = q.split(" ");
  if (words.length < 6) return false;
  const size = 5;
  let hit = 0;
  let total = 0;
  for (let i = 0; i + size <= words.length; i++) {
    total++;
    if (page.includes(words.slice(i, i + size).join(" "))) hit++;
  }
  return total > 0 && hit / total >= 0.8;
}

/** A duration such as "3-5 business days" or "up to six weeks". */
export const DURATION_RE =
  /\b(\d+(\s*(-|to|–)\s*\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|several|a few|couple of)\s+(business\s+|working\s+)?(minute|hour|day|week|month)s?\b/i;

export const NO_TIMELINE_TEXT =
  "No review timeline published by the provider was found in the pages retrieved for this investigation.";

export function verifyDraft(
  draft: GuideDraft,
  sources: VerifySource[],
): Pick<Guide, "steps" | "scopes" | "console" | "validation"> & { draft: GuideDraft } {
  const byId = new Map(sources.map((s) => [s.id, s]));
  const adjustments: Adjustment[] = [];
  const allText = sources.map((s) => s.text).join("\n");
  const allUrls = new Set(sources.map((s) => stripUrl(s.url)));
  const out: GuideDraft = structuredClone(draft);

  const checkClaim = (claim: Claim, path: string) => {
    const before = claim.sourceIds.length;
    const validIds = [...new Set(claim.sourceIds)].filter((id) => byId.has(id));
    if (validIds.length !== before) {
      adjustments.push({
        path,
        change: "removed citation",
        reason: `cited ${claim.sourceIds.filter((id) => !byId.has(id)).join(", ") || "a duplicate id"}, which is not a page retrieved in this run`,
      });
    }
    claim.sourceIds = validIds;

    if (claim.status === "verified") {
      const quote = claim.quote?.trim();
      if (!validIds.length) {
        claim.status = "inferred";
        claim.quote = null;
        adjustments.push({ path, change: "verified → inferred", reason: "no retrieved page was cited" });
      } else if (!quote) {
        claim.status = "inferred";
        adjustments.push({ path, change: "verified → inferred", reason: "no supporting quote was given" });
      } else {
        const supporting = validIds.filter((id) => quoteFound(quote, byId.get(id)!.text));
        if (!supporting.length) {
          // The quote may sit in a different retrieved page than the one cited.
          const elsewhere = sources.filter((s) => quoteFound(quote, s.text)).map((s) => s.id);
          if (elsewhere.length) {
            claim.sourceIds = elsewhere;
            adjustments.push({ path, change: "corrected citation", reason: `quote was found in ${elsewhere.join(", ")}, not in the page cited` });
          } else {
            claim.status = "inferred";
            claim.quote = null;
            adjustments.push({ path, change: "verified → inferred", reason: "the quoted text was not found in the cited page" });
          }
        }
      }
    } else {
      // Quotes are only shown for verified claims.
      claim.quote = null;
      if (claim.status === "unknown") claim.sourceIds = [];
    }
  };

  eachClaim(out, checkClaim);

  // A review duration is only allowed when it survived verification.
  const tl = out.externalReview.publishedTimeline;
  if (tl.status !== "verified" && DURATION_RE.test(tl.text)) {
    adjustments.push({
      path: "externalReview.publishedTimeline",
      change: "removed unverified duration",
      reason: `the text gave a duration ("${tl.text.slice(0, 120)}") that no retrieved page supports`,
    });
    tl.text = NO_TIMELINE_TEXT;
    tl.status = "unknown";
    tl.sourceIds = [];
    tl.quote = null;
  }

  const urlSeen = (u: string | null) => {
    if (!u) return false;
    const bare = stripUrl(u);
    return allUrls.has(bare) || allText.includes(bare) || allText.includes(u);
  };

  const steps = out.steps.map((s) => ({ ...s, linkSeenInSources: urlSeen(s.link) }));
  const examples = out.scopes.examples.map((e) => {
    const ids = e.sourceIds.filter((id) => byId.has(id));
    const haystack = (ids.length ? ids.map((id) => byId.get(id)!.text) : sources.map((s) => s.text)).join("\n");
    return { ...e, sourceIds: ids, seenInSource: e.scope.trim().length > 1 && haystack.includes(e.scope.trim()) };
  });
  const unseen = examples.filter((e) => !e.seenInSource).map((e) => e.scope);
  if (unseen.length) {
    adjustments.push({
      path: "scopes.examples",
      change: "flagged scope strings",
      reason: `not found verbatim in a retrieved page: ${unseen.join(", ")}`,
    });
  }

  const counts = { verified: 0, inferred: 0, unknown: 0 };
  eachClaim(out, (c) => counts[c.status]++);

  return {
    draft: out,
    steps,
    scopes: { model: out.scopes.model, examples },
    console: { ...out.console, urlSeenInSources: urlSeen(out.console.url) },
    validation: { adjustments, counts },
  };
}

function stripUrl(u: string): string {
  return u.replace(/[#?].*$/, "").replace(/\/$/, "");
}
