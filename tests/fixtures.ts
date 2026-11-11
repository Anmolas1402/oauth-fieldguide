import type { GuideDraft } from "../shared/schema.ts";
import type { VerifySource } from "../server/verify.ts";

/** Synthetic provider used only by tests. "Acme" is not a real provider and never ships in data/. */
export const sources: VerifySource[] = [
  {
    id: "S1",
    url: "https://docs.composio.dev/toolkits/acme",
    text: "# Acme\n- **Auth:** OAUTH2\n- **Composio-managed OAuth available?** No\nFor a step-by-step guide see https://composio.dev/auth/acme",
  },
  {
    id: "S2",
    url: "https://developers.acme.dev/docs/oauth/register",
    text:
      "Registering an app\nGo to the Developer Portal [https://developers.acme.dev/apps] and click New app. " +
      "Redirect URIs must use HTTPS and must match exactly. You can add up to five redirect URIs. " +
      "Apps that request the payments.write scope must pass a security review before going live. " +
      "The client secret is shown only once. Scopes: accounts.read, payments.write.",
  },
];

const claim = (text: string, status: "verified" | "inferred" | "unknown", sourceIds: string[] = [], quote: string | null = null) => ({
  text,
  status,
  sourceIds,
  quote,
});

export function makeDraft(): GuideDraft {
  return {
    providerStatus: "identified",
    provider: { name: "Acme", description: "Payments API.", assumption: null },
    oauthAppKind: "OAuth 2.0 app",
    authMethod: claim("OAuth 2.0 authorization code flow.", "inferred", ["S2"]),
    difficulty: { level: "medium", rationale: "Self-serve registration, review for one scope." },
    handsOnEffort: { estimate: "30 to 60 minutes", basis: "Assumes an existing developer account." },
    externalReview: {
      requirement: "conditional",
      summary: claim("A security review applies to apps requesting payments.write.", "verified", ["S2"], "Apps that request the payments.write scope must pass a security review before going live."),
      triggers: [claim("Requesting payments.write.", "verified", ["S2"], "must pass a security review before going live")],
      publishedTimeline: claim("Reviews usually take 2-3 weeks.", "inferred", ["S2"]),
    },
    prerequisites: [{ kind: "account", ...claim("An Acme developer account.", "inferred") }],
    console: { name: "Acme Developer Portal", url: "https://developers.acme.dev/apps" },
    redirectRules: [
      claim("Redirect URIs must use HTTPS and match exactly.", "verified", ["S2"], "Redirect URIs must use HTTPS and must match exactly."),
      claim("Wildcards are allowed in subdomains.", "verified", ["S2"], "Wildcard subdomains are permitted for all redirect URIs."),
    ],
    scopes: {
      model: claim("Scopes are selected per app.", "inferred"),
      examples: [
        { scope: "accounts.read", grants: "Read accounts.", tier: null, sourceIds: ["S2"] },
        { scope: "ledger.admin", grants: "Administer ledgers.", tier: null, sourceIds: ["S2"] },
      ],
    },
    steps: [
      {
        title: "Create the app",
        action: "Click New app and enter a name.",
        where: "Developer Portal",
        link: "https://developers.acme.dev/apps",
        actor: "agent_assists",
        actorReason: "The form is in your logged-in account.",
        ...claim("", "verified", ["S2", "S9"], "Go to the Developer Portal and click New app."),
      },
      {
        title: "Store the client secret",
        action: "Copy the secret into your secret manager.",
        where: "Developer Portal",
        link: "https://portal.acme.dev/secret",
        actor: "human_only",
        actorReason: "Secrets should not pass through an agent.",
        ...claim("", "verified", [], "The client secret is shown only once."),
      },
    ],
    division: { agentPrepares: ["List required scopes"], agentAssists: ["Fill the registration form"], humanOnly: ["Store the client secret"] },
    risks: [{ kind: "security", ...claim("The client secret is shown only once.", "verified", ["S1"], "The client secret is shown only once.") }],
    unresolved: ["Whether sandbox apps need review."],
    nextActions: ["Create a developer account."],
  };
}
