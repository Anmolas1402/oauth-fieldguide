import { z } from "zod";

/**
 * Evidence status of a single claim.
 * - verified: a page retrieved during this investigation says it, and the quote was found in that page.
 * - inferred: reasoned from retrieved material or general knowledge; not stated outright in a retrieved page.
 * - unknown:  the investigation looked and could not establish it.
 */
export const StatusSchema = z.enum(["verified", "inferred", "unknown"]);
export type Status = z.infer<typeof StatusSchema>;

const claimFields = {
  text: z.string(),
  status: StatusSchema,
  sourceIds: z.array(z.string()),
  quote: z.string().nullable(),
};
export const ClaimSchema = z.object(claimFields);
export type Claim = z.infer<typeof ClaimSchema>;

/** Who performs a setup step. The product itself never executes provider-console actions. */
export const ActorSchema = z.enum(["agent_prepares", "agent_assists", "human_only"]);
export type Actor = z.infer<typeof ActorSchema>;

export const StepSchema = z.object({
  title: z.string(),
  action: z.string(),
  where: z.string(),
  link: z.string().nullable(),
  actor: ActorSchema,
  actorReason: z.string(),
  ...claimFields,
});
export type Step = z.infer<typeof StepSchema>;

/** What the model is asked to produce. Composio facts are NOT in here: they come from live metadata. */
export const GuideDraftSchema = z.object({
  providerStatus: z.enum(["identified", "not_identified"]),
  provider: z.object({
    name: z.string(),
    description: z.string(),
    assumption: z.string().nullable(),
  }),
  oauthAppKind: z.string(),
  authMethod: ClaimSchema,
  difficulty: z.object({
    level: z.enum(["low", "medium", "high"]),
    rationale: z.string(),
  }),
  handsOnEffort: z.object({
    estimate: z.string(),
    basis: z.string(),
  }),
  externalReview: z.object({
    requirement: z.enum(["none", "conditional", "always", "unknown"]),
    summary: ClaimSchema,
    triggers: z.array(ClaimSchema),
    publishedTimeline: ClaimSchema,
  }),
  prerequisites: z.array(
    z.object({ kind: z.enum(["account", "permission", "plan", "other"]), ...claimFields }),
  ),
  console: z.object({ name: z.string(), url: z.string().nullable() }),
  redirectRules: z.array(ClaimSchema),
  scopes: z.object({
    model: ClaimSchema,
    examples: z.array(
      z.object({
        scope: z.string(),
        grants: z.string(),
        tier: z.string().nullable(),
        sourceIds: z.array(z.string()),
      }),
    ),
  }),
  steps: z.array(StepSchema),
  division: z.object({
    agentPrepares: z.array(z.string()),
    agentAssists: z.array(z.string()),
    humanOnly: z.array(z.string()),
  }),
  risks: z.array(
    z.object({ kind: z.enum(["review", "blocker", "security", "limit"]), ...claimFields }),
  ),
  unresolved: z.array(z.string()),
  nextActions: z.array(z.string()),
});
export type GuideDraft = z.infer<typeof GuideDraftSchema>;

export const SourceSchema = z.object({
  id: z.string(),
  url: z.string(),
  title: z.string(),
  kind: z.enum(["composio", "provider_page"]),
  /** Who published the page, from its hostname: the provider itself, Composio, or someone else. */
  authority: z.enum(["official", "composio", "third_party"]).default("third_party"),
  retrievedAt: z.string(),
  chars: z.number(),
  truncated: z.boolean(),
});
export type Source = z.infer<typeof SourceSchema>;

export const ComposioFactsSchema = z.object({
  /** Whether a Composio toolkit page was found for this provider. */
  listed: z.boolean(),
  name: z.string().nullable(),
  slug: z.string().nullable(),
  category: z.string().nullable(),
  authSchemes: z.array(z.string()),
  /** true/false straight from Composio's toolkit page; null when Composio does not say. */
  managedOAuth: z.boolean().nullable(),
  /** Which list of the managed-auth catalogue the toolkit is in, if any. */
  catalogueList: z.enum(["managed", "byo", "absent"]),
  customGuideUrl: z.string().nullable(),
  faq: z.array(z.object({ question: z.string(), answer: z.string() })),
  matchNote: z.string().nullable(),
  alternatives: z.array(z.object({ name: z.string(), slug: z.string() })),
});
export type ComposioFacts = z.infer<typeof ComposioFactsSchema>;

export const AdjustmentSchema = z.object({
  path: z.string(),
  change: z.string(),
  reason: z.string(),
});
export type Adjustment = z.infer<typeof AdjustmentSchema>;

export const InvestigationLogSchema = z.object({
  searches: z.array(
    z.object({ query: z.string(), results: z.array(z.object({ url: z.string(), title: z.string() })) }),
  ),
  fetches: z.array(
    z.object({
      url: z.string(),
      ok: z.boolean(),
      sourceId: z.string().nullable(),
      detail: z.string(),
    }),
  ),
});
export type InvestigationLog = z.infer<typeof InvestigationLogSchema>;

const scopeExampleFinal = z.object({
  scope: z.string(),
  grants: z.string(),
  tier: z.string().nullable(),
  sourceIds: z.array(z.string()),
  /** Whether the literal scope string was found in a cited retrieved page. */
  seenInSource: z.boolean(),
});

export const GuideSchema = GuideDraftSchema.extend({
  steps: z.array(StepSchema.extend({ linkSeenInSources: z.boolean() })),
  scopes: z.object({ model: ClaimSchema, examples: z.array(scopeExampleFinal) }),
  console: z.object({ name: z.string(), url: z.string().nullable(), urlSeenInSources: z.boolean() }),
  meta: z.object({
    query: z.string(),
    investigatedAt: z.string(),
    model: z.string(),
    durationMs: z.number(),
    /** live = produced by this request; saved = an earlier run of the same pipeline, stored in the repo. */
    origin: z.enum(["live", "saved"]),
  }),
  composio: ComposioFactsSchema,
  sources: z.array(SourceSchema),
  log: InvestigationLogSchema,
  validation: z.object({
    adjustments: z.array(AdjustmentSchema),
    counts: z.object({ verified: z.number(), inferred: z.number(), unknown: z.number() }),
    /** Verified claims whose only supporting pages are third-party (not the provider, not Composio). */
    thirdPartyOnly: z.array(z.string()).default([]),
    officialPagesRead: z.number().default(0),
  }),
});
export type Guide = z.infer<typeof GuideSchema>;

/** Outcome when the provider does not use OAuth in Composio at all (API key, etc.). */
export const NoOAuthResultSchema = z.object({
  kind: z.literal("no_oauth"),
  query: z.string(),
  investigatedAt: z.string(),
  composio: ComposioFactsSchema,
  sources: z.array(SourceSchema),
});
export type NoOAuthResult = z.infer<typeof NoOAuthResultSchema>;

export const STAGES = [
  { id: "resolve", label: "Identify the provider" },
  { id: "composio", label: "Check Composio managed OAuth availability" },
  { id: "research", label: "Find and read official provider documentation" },
  { id: "compose", label: "Assemble the guide from the evidence" },
  { id: "verify", label: "Cross-check claims against retrieved pages" },
] as const;
export type StageId = (typeof STAGES)[number]["id"];

export type Activity = {
  id: string;
  kind: "search" | "fetch" | "composio" | "note";
  label: string;
  url?: string;
  state: "running" | "done" | "failed";
  detail?: string;
};

export type PipelineEvent =
  | { type: "stage"; id: StageId; state: "running" | "done" | "failed" | "skipped"; detail?: string }
  | { type: "activity"; stage: StageId; activity: Activity }
  | { type: "composio"; facts: ComposioFacts }
  | { type: "result"; guide: Guide }
  | { type: "no_oauth"; result: NoOAuthResult }
  | { type: "error"; code: string; message: string; stage?: StageId }
  | { type: "ping" };

/** Walk every claim-like object in a guide (used by the validator, counters and exports). */
export function eachClaim(
  g: GuideDraft,
  visit: (claim: Claim, path: string) => void,
): void {
  visit(g.authMethod, "authMethod");
  visit(g.externalReview.summary, "externalReview.summary");
  g.externalReview.triggers.forEach((c, i) => visit(c, `externalReview.triggers[${i}]`));
  visit(g.externalReview.publishedTimeline, "externalReview.publishedTimeline");
  g.prerequisites.forEach((c, i) => visit(c, `prerequisites[${i}]`));
  g.redirectRules.forEach((c, i) => visit(c, `redirectRules[${i}]`));
  visit(g.scopes.model, "scopes.model");
  g.steps.forEach((c, i) => visit(c, `steps[${i}]`));
  g.risks.forEach((c, i) => visit(c, `risks[${i}]`));
}
