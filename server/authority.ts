/**
 * Classifies a retrieved page by publisher, from its hostname alone.
 * - composio: Composio's own docs and guides.
 * - official: a host that carries the provider's name (developer.xero.com, docs.github.com),
 *   plus a small map for providers whose docs live elsewhere (Gmail -> developers.google.com).
 * - third_party: everything else (integration vendors, blogs, Q&A sites).
 * It is a heuristic and errs toward third_party, which only ever adds a caution label.
 */
export type Authority = "official" | "composio" | "third_party";

const EXTRA_HOSTS: Record<string, string[]> = {
  gmail: ["google.com", "googleapis.com", "cloud.google.com", "googleblog.com"],
  googlecalendar: ["google.com"],
  googledrive: ["google.com"],
  googlesheets: ["google.com"],
  googledocs: ["google.com"],
  youtube: ["google.com"],
  outlook: ["microsoft.com"],
  microsoftteams: ["microsoft.com"],
  onedrive: ["microsoft.com"],
  office365: ["microsoft.com"],
  slack: ["slack.dev", "slack.com"],
  x: ["x.com", "twitter.com"],
};

const CODE_HOSTS = new Set(["github.com", "gitlab.com", "bitbucket.org"]);

const tokens = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").split(" ").filter((t) => t.length >= 3);

export function classifySource(url: string, providerName: string, slug: string | null): Authority {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "third_party";
  }
  if (host === "composio.dev" || host.endsWith(".composio.dev")) return "composio";
  const key = (slug ?? providerName).toLowerCase().replace(/[^a-z0-9]/g, "");
  const extra = EXTRA_HOSTS[key] ?? [];
  if (extra.some((h) => host === h || host.endsWith(`.${h}`))) return "official";
  const labels = host.split(".").slice(0, -1); // drop the TLD
  const names = new Set([key, ...tokens(providerName), ...tokens(slug ?? "")]);
  if (labels.some((l) => names.has(l) || (key.length >= 4 && l === key))) return "official";
  // On code hosts the organisation decides: github.com/XeroAPI/xero-python is Xero's own SDK.
  if (CODE_HOSTS.has(host)) {
    const org = new URL(url).pathname.split("/")[1]?.toLowerCase() ?? "";
    if (key.length >= 3 && org.replace(/[^a-z0-9]/g, "").startsWith(key)) return "official";
  }
  return "third_party";
}
