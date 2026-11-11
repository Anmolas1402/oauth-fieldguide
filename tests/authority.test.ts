import { describe, expect, it } from "vitest";
import { classifySource } from "../server/authority.ts";
import { verifyDraft } from "../server/verify.ts";
import { makeDraft, sources } from "./fixtures.ts";

describe("source publisher classification", () => {
  it.each([
    ["https://developer.xero.com/documentation/guides/oauth2/overview/", "Xero", "XERO", "official"],
    ["https://docs.github.com/en/apps/oauth-apps", "GitHub", "GITHUB", "official"],
    ["https://shopify.dev/docs/apps/build", "Shopify", "SHOPIFY", "official"],
    ["https://developers.google.com/workspace/gmail/api/auth/scopes", "Gmail", "GMAIL", "official"],
    ["https://docs.slack.dev/authentication/installing-with-oauth", "Slack", "SLACK", "official"],
    ["https://composio.dev/auth/xero", "Xero", "XERO", "composio"],
    ["https://nango.dev/docs/api-integrations/xero/how-to-register", "Xero", "XERO", "third_party"],
    ["https://stackoverflow.com/questions/1/github-oauth", "GitHub", "GITHUB", "third_party"],
    ["https://medium.com/@someone/gmail-oauth", "Gmail", "GMAIL", "third_party"],
    ["not a url", "Xero", "XERO", "third_party"],
    ["https://github.com/XeroAPI/xero-python", "Xero", "XERO", "official"],
    ["https://github.com/someone/xero-helper", "Xero", "XERO", "third_party"],
  ])("%s for %s is %s", (url, name, slug, expected) => {
    expect(classifySource(url, name, slug)).toBe(expected);
  });
});

describe("third-party-only evidence", () => {
  it("lists verified claims whose only sources are third-party pages", () => {
    const d = makeDraft();
    const srcs = sources.map((s) => ({ ...s, authority: s.id === "S2" ? ("third_party" as const) : ("composio" as const) }));
    const r = verifyDraft(d, srcs);
    expect(r.validation.thirdPartyOnly).toContain("redirectRules[0]");
    expect(r.validation.officialPagesRead).toBe(0);
  });
});
