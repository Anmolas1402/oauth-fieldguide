import { describe, expect, it } from "vitest";
import { GuideSchema, type Guide } from "../shared/schema.ts";
import { guideToChecklist, guideToMarkdown } from "../shared/markdown.ts";
import { verifyDraft } from "../server/verify.ts";
import { makeDraft, sources } from "./fixtures.ts";

export function makeGuide(): Guide {
  const checked = verifyDraft(makeDraft(), sources);
  return GuideSchema.parse({
    ...checked.draft,
    steps: checked.steps,
    scopes: checked.scopes,
    console: checked.console,
    meta: { query: "acme", investigatedAt: "2026-11-10T10:00:00.000Z", model: "test-model", durationMs: 1000, origin: "live" },
    composio: { listed: true, name: "Acme", slug: "ACME", category: null, authSchemes: ["OAUTH2"], managedOAuth: false, catalogueList: "byo", customGuideUrl: null, faq: [], matchNote: null, alternatives: [] },
    sources: sources.map((s) => ({ id: s.id, url: s.url, title: s.id === "S1" ? "Acme toolkit" : "Registering an app", kind: s.id === "S1" ? "composio" : "provider_page", retrievedAt: "2026-11-10T10:00:00.000Z", chars: s.text.length, truncated: false })),
    log: { searches: [{ query: "acme oauth app", results: [] }], fetches: [{ url: "https://portal.acme.dev/login", ok: false, sourceId: null, detail: "HTTP 403" }] },
    validation: checked.validation,
  });
}

describe("markdown export", () => {
  const g = makeGuide();
  const md = guideToMarkdown(g, new Set([0]));
  it("includes every section a developer needs", () => {
    for (const h of ["## Decision snapshot", "## Before you begin", "## Setup steps", "## Agent vs. human", "## Approval and risks", "## Next actions", "## Unresolved questions", "## Sources"]) {
      expect(md).toContain(h);
    }
  });
  it("states managed vs own-app ownership and keeps effort apart from review time", () => {
    expect(md).toContain("| Composio-managed OAuth app | Not available |");
    expect(md).toContain("| Your own OAuth app | Required |");
    expect(md).toContain("Hands-on effort (this tool's estimate)");
    expect(md).toContain("Published review timeline");
    expect(md).not.toContain("2-3 weeks");
  });
  it("carries evidence labels, source ids, source URLs and failed retrievals", () => {
    expect(md).toContain("_(Verified [S2])_");
    expect(md).toContain("_(Inferred");
    expect(md).toContain("https://developers.acme.dev/docs/oauth/register");
    expect(md).toContain("https://portal.acme.dev/login (HTTP 403)");
  });
  it("reflects checked steps", () => {
    expect(md).toContain("- [x] Click New app and enter a name.");
    expect(md).toContain("- [ ] Copy the secret into your secret manager.");
  });
  it("produces a compact checklist with the owner of each step", () => {
    expect(guideToChecklist(g, new Set([1]))).toBe(
      "Acme OAuth app setup checklist\n\n- [ ] 1. Create the app (Agent assists, you authorize)\n- [x] 2. Store the client secret (You only)\n",
    );
  });
});

import { investigationGaps } from "../shared/derive.ts";
import { guideToMarkdown as toMd } from "../shared/markdown.ts";
import { GuideSchema as GS } from "../shared/schema.ts";
import { readFileSync } from "node:fs";

describe("incomplete-investigation state", () => {
  const load = (slug: string) => GS.parse(JSON.parse(readFileSync(`data/guides/${slug}.json`, "utf8")));
  it("flags a guide with no official pages, few verified steps and unknown review", () => {
    const g = load("github");
    g.validation.officialPagesRead = 0;
    g.steps = g.steps.slice(0, 2);
    g.externalReview.requirement = "unknown";
    const gaps = investigationGaps(g);
    expect(gaps).toHaveLength(3);
    expect(gaps[0]).toMatch(/No page from GitHub's own documentation/);
    expect(toMd(g)).toMatch(/Incomplete investigation/);
  });
  it("flags when fewer than half the steps are verified", () => {
    const g = load("github");
    g.steps = g.steps.map((s, i) => ({ ...s, status: i === 0 ? "verified" : "inferred" }));
    expect(investigationGaps(g).join(" ")).toMatch(/Only 1 of \d+ setup steps/);
  });
});
