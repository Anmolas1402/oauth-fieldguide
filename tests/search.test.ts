import { beforeEach, describe, expect, it } from "vitest";
import { parseBrave, parseDuckDuckGo, resetSearchState, searchWeb } from "../server/search.ts";

const DDG = `
<div class="result"><a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fdeveloper.xero.com%2Fdocumentation%2Fguides%2Foauth2%2Foverview%2F&amp;rut=abc">OAuth 2.0 &mdash; Xero <b>Developer</b></a>
<a class="result__snippet" href="x">OAuth 2.0 is a protocol that lets your app access a user&#x27;s account.</a></div>
<div class="result"><a rel="nofollow" class="result__a" href="https://duckduckgo.com/y.js?ad_domain=ads.example">Sponsored</a></div>
<div class="result"><a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fdeveloper.xero.com%2Fdocumentation%2Fguides%2Foauth2%2Foverview%2F%23top&amp;rut=def">Duplicate</a></div>
<div class="result"><a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fcomposio.dev%2Fauth%2Fxero&amp;rut=ghi">Connect Xero</a></div>`;

const BRAVE = `<html><div class="snippet svelte-x" data-pos="0" data-type="web"><a href="https://imgs.search.brave.com/fav"></a>
<a href="https://developers.zoom.us/docs/distribute/app-review-process/" class="l1"><div class="title search-snippet-title line-clamp-1" title="App Review Process - Zoom Developer Docs">App Review Process</div></a>
<div class="content desktop-default-regular">This helps the Zoom Review Team <strong>verify</strong> scopes.</div></div>
<div class="snippet svelte-x" data-pos="1" data-type="web"><a href="https://support.zoom.com/hc/en/article?id=1&amp;x=2"><div class="title search-snippet-title">Security review</div></a></div></html>`;

const page = (body: string, status = 200) => new Response(body, { status, headers: { "content-type": "text/html" } });

describe("search result parsing", () => {
  it("decodes DuckDuckGo redirect links, drops ads and duplicates", () => {
    const r = parseDuckDuckGo(DDG);
    expect(r.map((x) => x.url)).toEqual(["https://developer.xero.com/documentation/guides/oauth2/overview/", "https://composio.dev/auth/xero"]);
    expect(r[0].title).toBe("OAuth 2.0 — Xero Developer");
    expect(r[0].snippet).toBe("OAuth 2.0 is a protocol that lets your app access a user's account.");
  });
  it("reads Brave results and skips Brave's own asset links", () => {
    const r = parseBrave(BRAVE);
    expect(r).toHaveLength(2);
    expect(r[0]).toEqual({
      url: "https://developers.zoom.us/docs/distribute/app-review-process/",
      title: "App Review Process - Zoom Developer Docs",
      snippet: "This helps the Zoom Review Team verify scopes.",
    });
    expect(r[1].url).toBe("https://support.zoom.com/hc/en/article?id=1&x=2");
  });
});

describe("searchWeb", () => {
  beforeEach(() => resetSearchState());
  const engines = [
    { name: "A", url: (q: string) => `https://a.test/?q=${q}`, parse: parseDuckDuckGo },
    { name: "B", url: (q: string) => `https://b.test/?q=${q}`, parse: parseBrave },
  ];

  it("falls back to the next engine when one is rate limited, then skips the limited one", async () => {
    const hits: string[] = [];
    const fake = (async (u: string | URL) => {
      const url = String(u);
      hits.push(url.slice(8, 9));
      return url.startsWith("https://a.test") ? page("Too many", 429) : page(BRAVE);
    }) as typeof fetch;
    const first = await searchWeb("zoom review", fake, engines);
    expect(first.ok && first.engine).toBe("B");
    const second = await searchWeb("zoom scopes", fake, engines);
    expect(second.ok).toBe(true);
    expect(hits).toEqual(["a", "b", "b"]); // A was not asked again during its cooldown
  });

  it("reports a bot-check page as a failure with the reason, not as zero results", async () => {
    const fake = (async () => page("<html>Please complete the captcha to continue</html>")) as typeof fetch;
    const r = await searchWeb("anything", fake, engines);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.attempts).toEqual(["A: blocked by a bot check", "B: blocked by a bot check"]);
  });

  it("caches successful queries", async () => {
    let calls = 0;
    const fake = (async () => (calls++, page(DDG))) as typeof fetch;
    await searchWeb("Xero OAuth", fake, engines);
    await searchWeb("xero   oauth", fake, engines);
    expect(calls).toBe(1);
  });
});
