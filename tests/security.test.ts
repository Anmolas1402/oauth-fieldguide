import { describe, expect, it } from "vitest";
import { allow, clientAddress } from "../server/app.ts";
import { fetchPage } from "../server/fetchPage.ts";
import { assertPublicHost, isPublicAddress, makeGuardedLookup, makeSafeFetch, PrivateAddressError } from "../server/netguard.ts";

const neverFetch = (async () => {
  throw new Error("fetch must not be called");
}) as unknown as typeof fetch;

describe("isPublicAddress", () => {
  it.each([
    "127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1",
    "0.0.0.0", "224.0.0.1", "255.255.255.255", "::1", "::", "fe80::1", "fc00::1", "fd12:3456::1",
    "::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:10.0.0.1", "::127.0.0.1", "64:ff9b::a00:1", "2002:7f00:1::1", "not-an-ip",
  ])("rejects %s", (ip) => expect(isPublicAddress(ip)).toBe(false));
  it.each(["93.184.216.34", "140.82.112.3", "172.32.0.1", "2606:4700::6810:84e5", "::ffff:8.8.8.8"])("accepts %s", (ip) =>
    expect(isPublicAddress(ip)).toBe(true),
  );
});

describe("DNS-level SSRF protection", () => {
  it("refuses a public-looking host whose DNS answer is loopback, without fetching", async () => {
    const page = await fetchPage("https://docs.attacker-controlled.com/oauth", neverFetch, async () => [{ address: "127.0.0.1", family: 4 }]);
    expect(page.ok).toBe(false);
    if (!page.ok) expect(page.reason).toMatch(/non-public address \(127\.0\.0\.1\)/);
  });

  it("refuses when any one of several answers is private (cloud metadata)", async () => {
    await expect(
      assertPublicHost("x.example-docs.com", async () => [
        { address: "93.184.216.34", family: 4 },
        { address: "169.254.169.254", family: 4 },
      ]),
    ).rejects.toBeInstanceOf(PrivateAddressError);
  });

  it("re-checks every redirect hop's DNS", async () => {
    const dns = async (host: string) => [{ address: host === "public.docs-site.com" ? "93.184.216.34" : "10.0.0.5", family: 4 }];
    const fetchImpl = (async () =>
      new Response(null, { status: 302, headers: { location: "https://internal.docs-site.com/secret" } })) as unknown as typeof fetch;
    const page = await fetchPage("https://public.docs-site.com/start", fetchImpl, dns);
    expect(page.ok).toBe(false);
    if (!page.ok) expect(page.reason).toMatch(/10\.0\.0\.5/);
  });

  it("the connect-time lookup refuses private answers (DNS rebinding after the pre-check)", async () => {
    const lookup = makeGuardedLookup((_h, _o, cb) => cb(null, [{ address: "127.0.0.1", family: 4 }]));
    const err = await new Promise<Error | null>((resolve) => lookup("rebind.docs-site.com", {}, (e) => resolve(e)));
    expect(err).toBeInstanceOf(PrivateAddressError);
  });

  it("safe fetch never opens a connection to a rebinding host", async () => {
    const safe = makeSafeFetch(makeGuardedLookup((_h, _o, cb) => cb(null, [{ address: "127.0.0.1", family: 4 }])));
    const err = await safe("https://rebind.docs-site.com/").then(
      () => null,
      (e: Error) => e,
    );
    expect(err).not.toBeNull();
    expect(String((err as Error & { cause?: Error }).cause?.message ?? err?.message)).toMatch(/non-public address/);
  });

  it("safe fetch passes public answers through to the connection", async () => {
    const seen: string[] = [];
    const lookup = makeGuardedLookup((h, _o, cb) => {
      seen.push(h);
      cb(null, [{ address: "93.184.216.34", family: 4 }]);
    });
    const ok = await new Promise<string | undefined>((resolve) => lookup("docs.github.com", {}, (_e, a) => resolve(a as string)));
    expect(ok).toBe("93.184.216.34");
    expect(seen).toEqual(["docs.github.com"]);
  });
});

describe("rate-limit client address", () => {
  it("ignores X-Forwarded-For when no proxy is trusted", () => {
    expect(clientAddress("1.2.3.4", "203.0.113.9", 0)).toBe("203.0.113.9");
  });
  it("uses the entry appended by the trusted proxy, not the client-supplied leftmost one", () => {
    // Client sent "X-Forwarded-For: 1.1.1.1"; Render's proxy appended the real peer.
    expect(clientAddress("1.1.1.1, 198.51.100.7", "10.0.0.2", 1)).toBe("198.51.100.7");
  });
  it("rotating a spoofed header does not create new buckets", () => {
    const real = "198.51.100.77";
    const keys = new Set(["9.9.9.1", "9.9.9.2", "9.9.9.3"].map((spoof) => clientAddress(`${spoof}, ${real}`, "10.0.0.2", 1)));
    expect([...keys]).toEqual([real]);
  });
  it("falls back to the socket when the chain is shorter than the trusted hops", () => {
    expect(clientAddress(undefined, "10.0.0.2", 1)).toBe("10.0.0.2");
  });
  it("enforces the per-address hourly limit", () => {
    const addr = `test-${Math.random()}`;
    const results = Array.from({ length: 7 }, () => allow(addr));
    expect(results.slice(0, 6).every((r) => r === null)).toBe(true);
    expect(results[6]).toMatch(/per hour/);
  });
});
