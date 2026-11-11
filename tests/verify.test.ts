import { describe, expect, it } from "vitest";
import { GuideDraftSchema } from "../shared/schema.ts";
import { DURATION_RE, NO_TIMELINE_TEXT, quoteFound, verifyDraft } from "../server/verify.ts";
import { makeDraft, sources } from "./fixtures.ts";

describe("quoteFound", () => {
  const page = sources[1].text;
  it("finds an exact quote regardless of case, quotes and whitespace", () => {
    expect(quoteFound("  redirect uris must use HTTPS and  must match exactly. ", page)).toBe(true);
    expect(quoteFound("“The client secret is shown only once.”", page)).toBe(true);
  });
  it("tolerates link targets that the HTML conversion inserts mid-sentence", () => {
    expect(quoteFound("Go to the Developer Portal and click New app.", page)).toBe(true);
  });
  it("rejects text that is not on the page", () => {
    expect(quoteFound("Wildcard subdomains are permitted for all redirect URIs.", page)).toBe(false);
    expect(quoteFound("HTTPS", page)).toBe(false); // too short to count as evidence
  });
});

describe("verifyDraft", () => {
  const result = verifyDraft(makeDraft(), sources);
  const reasons = result.validation.adjustments.map((a) => `${a.path}: ${a.change}`);

  it("keeps a verified claim whose quote is in the cited page", () => {
    expect(result.draft.redirectRules[0].status).toBe("verified");
    expect(result.draft.externalReview.summary.status).toBe("verified");
  });
  it("downgrades a verified claim whose quote is not in the cited page", () => {
    expect(result.draft.redirectRules[1].status).toBe("inferred");
    expect(result.draft.redirectRules[1].quote).toBeNull();
    expect(reasons).toContain("redirectRules[1]: verified → inferred");
  });
  it("drops citations to pages that were never retrieved", () => {
    expect(result.draft.steps[0].sourceIds).toEqual(["S2"]);
    expect(reasons).toContain("steps[0]: removed citation");
  });
  it("downgrades a verified claim that cites nothing", () => {
    expect(result.draft.steps[1].status).toBe("inferred");
  });
  it("moves a citation to the page that actually contains the quote", () => {
    expect(result.draft.risks[0].sourceIds).toEqual(["S2"]);
    expect(result.draft.risks[0].status).toBe("verified");
    expect(reasons).toContain("risks[0]: corrected citation");
  });
  it("removes a review duration that no retrieved page supports", () => {
    const t = result.draft.externalReview.publishedTimeline;
    expect(t.text).toBe(NO_TIMELINE_TEXT);
    expect(t.status).toBe("unknown");
    expect(reasons).toContain("externalReview.publishedTimeline: removed unverified duration");
  });
  it("keeps a review duration that is quoted from a retrieved page", () => {
    const d = makeDraft();
    const src = [...sources, { id: "S3", url: "https://developers.acme.dev/review", text: "Security reviews are typically completed within 10 business days of submission." }];
    d.externalReview.publishedTimeline = { text: "Within 10 business days.", status: "verified", sourceIds: ["S3"], quote: "Security reviews are typically completed within 10 business days of submission." };
    expect(verifyDraft(d, src).draft.externalReview.publishedTimeline.text).toBe("Within 10 business days.");
  });
  it("flags scope strings and links that do not appear in retrieved pages", () => {
    expect(result.scopes.examples.map((e) => e.seenInSource)).toEqual([true, false]);
    expect(result.steps.map((s) => s.linkSeenInSources)).toEqual([true, false]);
    expect(result.console.urlSeenInSources).toBe(true);
  });
  it("counts statuses after adjustment and leaves the input untouched", () => {
    const c = result.validation.counts;
    expect(c.verified + c.inferred + c.unknown).toBe(11);
    expect(c.unknown).toBe(1);
    expect(makeDraft().redirectRules[1].status).toBe("verified");
  });
});

describe("schema", () => {
  it("accepts a well-formed draft", () => {
    expect(GuideDraftSchema.safeParse(makeDraft()).success).toBe(true);
  });
  it("rejects an unknown status or actor", () => {
    const bad = makeDraft() as any;
    bad.authMethod.status = "confirmed";
    expect(GuideDraftSchema.safeParse(bad).success).toBe(false);
    const bad2 = makeDraft() as any;
    bad2.steps[0].actor = "automated";
    expect(GuideDraftSchema.safeParse(bad2).success).toBe(false);
  });
  it("rejects a draft with a missing section", () => {
    const bad = makeDraft() as any;
    delete bad.externalReview;
    expect(GuideDraftSchema.safeParse(bad).success).toBe(false);
  });
});

describe("DURATION_RE", () => {
  it.each(["2-3 weeks", "up to 10 business days", "several weeks", "six weeks"])("matches %s", (s) => expect(DURATION_RE.test(s)).toBe(true));
  it.each(["No timeline is published.", "OAuth 2.0 with 3 scopes"])("ignores %s", (s) => expect(DURATION_RE.test(s)).toBe(false));
});
