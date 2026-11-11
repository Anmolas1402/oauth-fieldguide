import { describe, expect, it } from "vitest";
import { ownership } from "../shared/derive.ts";
import { customGuideUrl, parseCatalogue, parseToolkitHead, relevantFaq } from "../server/composio.ts";
import { checkUrl, htmlToText } from "../server/fetchPage.ts";
import { resolveProvider } from "../server/resolve.ts";

const CATALOGUE = `# Managed OAuth apps
intro
## Composio-managed OAuth available (3)
| Toolkit | Slug |
|---------|------|
| [GitHub](/toolkits/github.md) | \`GITHUB\` |
| [Gmail](/toolkits/gmail.md) | \`GMAIL\` |
| [Linear](/toolkits/linear.md) | \`LINEAR\` |
| [Google Calendar](/toolkits/googlecalendar.md) | \`GOOGLECALENDAR\` |
## Bring your own OAuth app (2)
| Toolkit | Slug |
|---------|------|
| [Shopify](/toolkits/shopify.md) | \`SHOPIFY\` |
| [Linear MCP](/toolkits/linear_mcp.md) | \`LINEAR_MCP\` |
| [Google Classroom](/toolkits/google_classroom.md) | \`GOOGLE_CLASSROOM\` |
`;

const TOOLKIT = `---
canonical_url: "https://docs.composio.dev/toolkits/shopify"
---

# Shopify

Shopify is an e-commerce platform.

- **Category:** ecommerce
- **Auth:** OAUTH2, S2S_OAUTH2
- **Composio-managed OAuth available?** No
- **Tools:** 468
- **Slug:** \`SHOPIFY\`

## Frequently Asked Questions

### How do I set up custom OAuth credentials for Shopify?

See [How to create OAuth credentials for Shopify](https://composio.dev/auth/shopify).

### How do I list products?

Use the list tool.

## Tools

### Some tool
ignored
`;

describe("Composio catalogue parsing", () => {
  const entries = parseCatalogue(CATALOGUE);
  it("assigns each toolkit to the managed or bring-your-own list", () => {
    expect(entries.find((e) => e.slug === "GITHUB")?.list).toBe("managed");
    expect(entries.find((e) => e.slug === "SHOPIFY")?.list).toBe("byo");
    expect(entries).toHaveLength(7);
  });
  it("keeps the docs page slug separately from the toolkit slug", () => {
    expect(entries.find((e) => e.slug === "LINEAR_MCP")?.pageSlug).toBe("linear_mcp");
  });
});

describe("toolkit page parsing", () => {
  const head = parseToolkitHead(TOOLKIT, "https://docs.composio.dev/toolkits/shopify");
  it("reads auth schemes and the managed flag", () => {
    expect(head.name).toBe("Shopify");
    expect(head.authSchemes).toEqual(["OAUTH2", "S2S_OAUTH2"]);
    expect(head.managedOAuth).toBe(false);
    expect(head.slug).toBe("SHOPIFY");
    expect(head.category).toBe("ecommerce");
  });
  it("stops before the tool listing and keeps only setup-relevant FAQ entries", () => {
    expect(head.text).not.toContain("Some tool");
    expect(head.faq).toHaveLength(2);
    expect(relevantFaq(head.faq).map((f) => f.question)).toEqual(["How do I set up custom OAuth credentials for Shopify?"]);
    expect(customGuideUrl(head)).toBe("https://composio.dev/auth/shopify");
  });
  it("reports null when the page does not state managed availability", () => {
    expect(parseToolkitHead("# OpenAI\n\nx\n\n- **Auth:** API_KEY\n", "u").managedOAuth).toBeNull();
  });
});

describe("provider resolution", () => {
  const entries = parseCatalogue(CATALOGUE);
  it("matches exactly, ignoring case and punctuation", () => {
    const r = resolveProvider("  git-hub ", entries);
    expect(r.match?.slug).toBe("GITHUB");
    expect(r.confidence).toBe("exact");
    expect(r.note).toBeNull();
  });
  it("prefers the base toolkit over its MCP variant and offers the variant", () => {
    const r = resolveProvider("linear", entries);
    expect(r.match?.slug).toBe("LINEAR");
    expect(r.alternatives.map((a) => a.slug)).toContain("LINEAR_MCP");
  });
  it("states its assumption when a name is ambiguous", () => {
    const r = resolveProvider("Google", entries);
    expect(r.confidence).toBe("close");
    expect(r.note).toMatch(/Assumed you mean/);
    expect(r.alternatives.length).toBeGreaterThan(0);
  });
  it("applies aliases and says so", () => {
    const r = resolveProvider("google mail", entries);
    expect(r.match?.slug).toBe("GMAIL");
    expect(r.note).toMatch(/was read as/);
  });
  it("tolerates a one-letter typo", () => {
    expect(resolveProvider("shopfy", entries).match?.slug).toBe("SHOPIFY");
  });
  it("returns no match with slug guesses for unknown providers", () => {
    const r = resolveProvider("Zzqqx Corp", entries);
    expect(r.match).toBeNull();
    expect(r.slugGuesses).toEqual(["zzqqxcorp", "zzqqx_corp"]);
  });
  it("honours an explicit slug", () => {
    expect(resolveProvider("slug:linear_mcp", entries).match?.slug).toBe("LINEAR_MCP");
  });
});

describe("managed vs bring-your-own verdict", () => {
  const base = { listed: true, name: "X", slug: "X", category: null, catalogueList: "managed" as const, customGuideUrl: null, faq: [], matchNote: null, alternatives: [] };
  it("says custom is optional when a managed app exists", () => {
    expect(ownership({ ...base, authSchemes: ["OAUTH2"], managedOAuth: true })).toMatchObject({ managed: "Available", custom: "Optional" });
  });
  it("says custom is required when no managed app exists", () => {
    expect(ownership({ ...base, authSchemes: ["OAUTH2"], managedOAuth: false })).toMatchObject({ managed: "Not available", custom: "Required" });
  });
  it("does not guess for providers Composio does not list", () => {
    expect(ownership({ ...base, listed: false, authSchemes: [], managedOAuth: null })).toMatchObject({ managed: "Unknown", custom: "Unknown" });
  });
  it("marks OAuth as not applicable for API-key toolkits", () => {
    expect(ownership({ ...base, authSchemes: ["API_KEY"], managedOAuth: null }).custom).toBe("Not applicable");
  });
});

describe("page fetching guards", () => {
  it.each(["http://example.org/x", "https://localhost/x", "https://127.0.0.1/x", "https://[::1]/x", "https://intranet/x", "https://a.internal/x", "https://u:p@github.com/", "https://github.com:8443/", "ftp://github.com/x", "not a url"])(
    "refuses %s",
    (u) => expect(checkUrl(u).ok).toBe(false),
  );
  it("allows public https documentation URLs", () => {
    expect(checkUrl("https://docs.github.com/en/apps/oauth-apps").ok).toBe(true);
  });
  it("extracts main text and drops navigation and scripts", () => {
    const { title, text } = htmlToText(
      "<html><head><title>Docs &amp; Guides</title><script>evil()</script></head><body><nav>Menu</nav><main><h1>Register</h1><p>Callback URLs must use <a href='https://x.dev/https'>HTTPS</a>.</p></main><footer>Legal</footer></body></html>",
    );
    expect(title).toBe("Docs & Guides");
    expect(text).toContain("Register");
    expect(text).toContain("Callback URLs must use HTTPS");
    expect(text).not.toMatch(/Menu|Legal|evil/);
  });
});
