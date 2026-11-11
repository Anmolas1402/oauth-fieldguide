import type { Actor, ComposioFacts, Guide, Status } from "./schema.ts";

export const STATUS_LABEL: Record<Status, string> = {
  verified: "Verified",
  inferred: "Inferred",
  unknown: "Unknown",
};

export const STATUS_HELP: Record<Status, string> = {
  verified: "A page retrieved in this investigation states this, and the quote was found in that page.",
  inferred: "Reasoned from retrieved material or general knowledge. No retrieved page states it outright, so confirm before relying on it.",
  unknown: "The investigation looked for this and could not establish it.",
};

export const ACTOR_LABEL: Record<Actor, string> = {
  agent_prepares: "Agent can prepare",
  agent_assists: "Agent assists, you authorize",
  human_only: "You only",
};

export const ACTOR_HELP: Record<Actor, string> = {
  agent_prepares: "Research or drafting an agent can do without access to your accounts.",
  agent_assists: "An agent can prepare the inputs and walk you through it, but a logged-in person has to perform or approve it.",
  human_only: "Needs your identity, your consent, your payment details or your secrets.",
};

export type OwnershipVerdict = {
  managed: "Available" | "Not available" | "Unknown";
  custom: "Required" | "Optional" | "Unknown" | "Not applicable";
  detail: string;
};

/** Managed vs bring-your-own, decided only from Composio's live metadata. */
export function ownership(c: ComposioFacts): OwnershipVerdict {
  if (!c.listed) {
    return {
      managed: "Unknown",
      custom: "Unknown",
      detail: "Composio's documentation has no toolkit page under this name, so managed OAuth availability could not be checked.",
    };
  }
  const usesOAuth = c.authSchemes.some((s) => /oauth/i.test(s));
  if (!usesOAuth && c.authSchemes.length) {
    return {
      managed: "Not available",
      custom: "Not applicable",
      detail: `Composio lists this toolkit with ${c.authSchemes.join(", ")} authentication, not OAuth.`,
    };
  }
  if (c.managedOAuth === true) {
    return {
      managed: "Available",
      custom: "Optional",
      detail:
        "Composio provides an OAuth app for this toolkit. Registering your own is optional: Composio's docs name your own branding on the consent screen, custom scopes, dedicated rate-limit quota and custom instances as the reasons to do it.",
    };
  }
  if (c.managedOAuth === false) {
    return {
      managed: "Not available",
      custom: "Required",
      detail: "Composio does not provide an OAuth app for this toolkit. You must register your own and supply its client ID and client secret.",
    };
  }
  return { managed: "Unknown", custom: "Unknown", detail: "Composio's toolkit page does not state whether a managed OAuth app is available." };
}

export const REVIEW_LABEL: Record<Guide["externalReview"]["requirement"], string> = {
  none: "No provider review",
  conditional: "Review in some cases",
  always: "Review required",
  unknown: "Review requirement unknown",
};

export const DIFFICULTY_LABEL: Record<Guide["difficulty"]["level"], string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export function guideKey(g: Guide): string {
  return (g.composio.slug ?? g.provider.name).toLowerCase().replace(/[^a-z0-9]+/g, "_");
}
