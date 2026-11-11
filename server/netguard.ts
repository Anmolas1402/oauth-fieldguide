import { lookup as dnsLookup, promises as dnsPromises, type LookupAddress } from "node:dns";
import { BlockList, isIP } from "node:net";
import { Agent, fetch as undiciFetch } from "undici";

/**
 * DNS-level SSRF protection for pages the model asks us to read.
 *
 * checkUrl() rejects IP literals and internal-looking names, but a public-looking hostname can still
 * resolve to 127.0.0.1, 10.x, 169.254.169.254 (cloud metadata) and so on. Two layers close that:
 *  1. assertPublicHost() resolves the name before the request and refuses non-public answers, so the
 *     user sees a clear reason.
 *  2. safeFetch connects through an undici Agent whose DNS lookup applies the same check at connect
 *     time, so a name that answers differently on the second lookup (DNS rebinding) is still refused.
 */

const v4 = new BlockList();
for (const [net, bits] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
  ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16],
  ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) v4.addSubnet(net, bits, "ipv4");

const v6 = new BlockList();
for (const [net, bits] of [
  ["::", 128], ["::1", 128], ["64:ff9b::", 96], ["64:ff9b:1::", 48], ["100::", 64], ["2001::", 32],
  ["2001:db8::", 32], ["2002::", 16], ["fc00::", 7], ["fe80::", 10], ["fec0::", 10], ["ff00::", 8],
] as const) v6.addSubnet(net, bits, "ipv6");

/** True only for globally routable unicast addresses. Anything unparseable counts as not public. */
export function isPublicAddress(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return !v4.check(ip, "ipv4");
  if (family !== 6) return false;
  const lower = ip.toLowerCase();
  // IPv4-mapped / IPv4-compatible forms: judge the embedded IPv4 address.
  const mapped = lower.match(/^::(?:ffff(?::0)?:)?(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPublicAddress(mapped[1]);
  const hexMapped = lower.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hexMapped) {
    const hi = parseInt(hexMapped[1], 16);
    const lo = parseInt(hexMapped[2], 16);
    return isPublicAddress(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
  }
  if (lower.startsWith("::ffff:")) return false;
  return !v6.check(ip, "ipv6");
}

export type ResolveHost = (host: string) => Promise<{ address: string; family: number }[]>;
export const resolveHostDns: ResolveHost = (host) => dnsPromises.lookup(host, { all: true, verbatim: true });

export class PrivateAddressError extends Error {
  code = "EPRIVATEADDR";
  constructor(host: string, address: string) {
    super(`${host} resolves to a non-public address (${address}); not fetched`);
  }
}

/** Resolves the host and throws PrivateAddressError if any answer is not a public address. */
export async function assertPublicHost(host: string, resolve: ResolveHost = resolveHostDns): Promise<void> {
  const answers = await resolve(host);
  if (!answers.length) throw new Error(`${host} did not resolve`);
  const bad = answers.find((a) => !isPublicAddress(a.address));
  if (bad) throw new PrivateAddressError(host, bad.address);
}

type LookupCallback = (err: NodeJS.ErrnoException | null, address?: string | LookupAddress[], family?: number) => void;
type LookupFn = (hostname: string, options: { all?: boolean; family?: number }, cb: LookupCallback) => void;

/** A dns.lookup replacement for socket connections that refuses non-public answers. */
export function makeGuardedLookup(base: LookupFn = dnsLookup as unknown as LookupFn): LookupFn {
  return (hostname, options, cb) => {
    base(hostname, { ...options, all: true }, (err, addresses) => {
      if (err) return cb(err);
      const list = (addresses ?? []) as LookupAddress[];
      const bad = list.find((a) => !isPublicAddress(a.address));
      if (!list.length || bad) return cb(new PrivateAddressError(hostname, bad?.address ?? "no address"));
      if (options?.all) return cb(null, list);
      return cb(null, list[0].address, list[0].family);
    });
  };
}

export function makeSafeFetch(lookup: LookupFn = makeGuardedLookup()): typeof fetch {
  const dispatcher = new Agent({ connect: { lookup: lookup as never } });
  return ((input: Parameters<typeof fetch>[0], init?: RequestInit) =>
    undiciFetch(input as never, { ...(init as object), dispatcher } as never)) as unknown as typeof fetch;
}

/** fetch that refuses to connect to non-public addresses, whatever DNS says at connect time. */
export const safeFetch = makeSafeFetch();
