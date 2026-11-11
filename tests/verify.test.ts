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
  it("tolerates list numbers between consecutive steps the quote joins", () => {
    const steps = "Steps\n 3.  In the left sidebar, click OAuth apps.\n\n 4.  Click New OAuth App.\n";
    expect(quoteFound("In the left sidebar, click OAuth apps. Click New OAuth App.", steps)).toBe(true);
    expect(quoteFound("Version 2.0 of the protocol is required.", "Version 2.0 of the protocol is required.")).toBe(true);
  });
  it("ignores quote marks and code markers the model dropped or kept", () => {
    const gh = ' 5.  In "Application name", type the name of your app.\n';
    expect(quoteFound("In Application name, type the name of your app.", gh)).toBe(true);
    const composio = "A session uses your config only when you pass its ID to `authConfigs`, keyed by toolkit.";
    expect(quoteFound("A session uses your config only when you pass its ID to authConfigs, keyed by toolkit.", composio)).toBe(true);
    expect(quoteFound("Open your Dev Dashboard.", "1. Log in to your Dev Dashboard [https://dev.shopify.com/dashboard].")).toBe(false);
    expect(quoteFound("Log in to your Dev Dashboard.", "1. Log in to your Dev Dashboard [https://dev.shopify.com/dashboard].")).toBe(true);
  });
  it("accepts an elided quote only when each excerpt appears in order", () => {
    expect(quoteFound("Redirect URIs must use HTTPS … The client secret is shown only once.", page)).toBe(true);
    expect(quoteFound("The client secret is shown only once. … Redirect URIs must use HTTPS", page)).toBe(false);
    expect(quoteFound("Redirect URIs must use HTTPS … secrets never expire at all", page)).toBe(false);
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
    expect(result.validation.adjustments.find((a) => a.path === "redirectRules[1]")?.reason).toContain("Wildcard subdomains are permitted");
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
  it("keeps only the quote when a verified timeline adds a duration the quote does not state", () => {
    const d = makeDraft();
    const src = [...sources, { id: "S3", url: "https://developers.acme.dev/review", text: "Restricted reviews can take several weeks to complete." }];
    d.externalReview.publishedTimeline = { text: "Brand checks take 2-3 days; restricted reviews take several weeks.", status: "verified", sourceIds: ["S3"], quote: "Restricted reviews can take several weeks to complete." };
    const r = verifyDraft(d, src);
    expect(r.draft.externalReview.publishedTimeline.text).toBe('The provider states: "Restricted reviews can take several weeks to complete."');
    expect(r.validation.adjustments.map((a) => a.change)).toContain("removed unsupported duration");
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

describe("actor guard", () => {
  it("moves a logged-in console action out of 'agent can prepare'", () => {
    const d = makeDraft();
    d.steps[0].actor = "agent_prepares";
    d.steps[0].action = "Click Create in the dashboard and copy the ID.";
    const r = verifyDraft(d, sources);
    expect(r.steps[0].actor).toBe("agent_assists");
    expect(r.validation.adjustments.map((a) => a.path)).toContain("steps[0].actor");
  });
  it("leaves genuine preparation alone", () => {
    const d = makeDraft();
    d.steps[0].actor = "agent_prepares";
    d.steps[0].title = "Work out the scopes";
    d.steps[0].action = "List the read and write scopes the integration needs.";
    expect(verifyDraft(d, sources).steps[0].actor).toBe("agent_prepares");
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
