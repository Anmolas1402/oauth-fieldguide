import { ACTOR_LABEL, DIFFICULTY_LABEL, REVIEW_LABEL, STATUS_LABEL, formatDate, investigationGaps, ownership } from "./derive.ts";
import type { Claim, Guide } from "./schema.ts";

const refs = (c: { sourceIds: string[] }) => (c.sourceIds.length ? ` [${c.sourceIds.join(", ")}]` : "");
const claimLine = (c: Claim) => `${c.text} _(${STATUS_LABEL[c.status]}${refs(c)})_`;

/** The copyable checklist: one line per setup step, marked with who does it. */
export function guideToChecklist(g: Guide, done: ReadonlySet<number> = new Set()): string {
  const lines = [`${g.provider.name} OAuth app setup checklist`, ""];
  g.steps.forEach((s, i) => {
    lines.push(`- [${done.has(i) ? "x" : " "}] ${i + 1}. ${s.title} (${ACTOR_LABEL[s.actor]})`);
  });
  return lines.join("\n") + "\n";
}

export function guideToMarkdown(g: Guide, done: ReadonlySet<number> = new Set()): string {
  const own = ownership(g.composio);
  const out: string[] = [];
  const p = (...l: string[]) => out.push(...l);

  p(`# ${g.provider.name}: OAuth app setup guide`, "");
  const gaps = investigationGaps(g);
  if (gaps.length)
    p("> **Incomplete investigation.** Treat this as a starting point, not a launch plan:", ...gaps.map((x) => `> - ${x}`), "");
  p(
    `Investigated ${formatDate(g.meta.investigatedAt)} by OAuth Fieldguide (${g.meta.model}). ` +
      `Evidence labels: **Verified** = backed by a quote found on a retrieved page (the check confirms the quote is on the page, not that it proves every part of the claim); **Inferred** = not stated outright in a retrieved page; **Unknown** = could not be established.`,
    "",
  );
  if (g.provider.assumption) p(`> Assumption: ${g.provider.assumption}`, "");
  if (g.composio.matchNote) p(`> ${g.composio.matchNote}`, "");

  p("## Decision snapshot", "");
  p("| Question | Answer |", "|---|---|");
  p(`| Composio-managed OAuth app | ${own.managed} |`);
  p(`| Your own OAuth app | ${own.custom} |`);
  p(`| What you register | ${g.oauthAppKind} |`);
  p(`| Authentication method | ${claimLine(g.authMethod).replace(/\|/g, "\\|")} |`);
  p(`| Setup difficulty | ${DIFFICULTY_LABEL[g.difficulty.level]}: ${g.difficulty.rationale.replace(/\|/g, "\\|")} |`);
  p(`| Hands-on effort (this tool's estimate) | ${g.handsOnEffort.estimate}. ${g.handsOnEffort.basis.replace(/\|/g, "\\|")} |`);
  p(`| External review | ${REVIEW_LABEL[g.externalReview.requirement]} |`);
  p(`| Published review timeline | ${claimLine(g.externalReview.publishedTimeline).replace(/\|/g, "\\|")} |`);
  p("", own.detail, "");

  p("## Before you begin", "");
  p(`Developer console: ${g.console.url ? `[${g.console.name}](${g.console.url})` : g.console.name}`, "");
  for (const c of g.prerequisites) p(`- ${claimLine(c)}`);
  p("");

  p("## Setup steps", "");
  g.steps.forEach((s, i) => {
    p(`### ${i + 1}. ${s.title}`, "");
    p(`- [${done.has(i) ? "x" : " "}] ${s.action}`);
    p(`- Where: ${s.where}${s.link ? ` (${s.link})` : ""}`);
    p(`- Who: **${ACTOR_LABEL[s.actor]}**. ${s.actorReason}`);
    p(`- Evidence: ${STATUS_LABEL[s.status]}${refs(s)}${s.quote ? `: "${s.quote}"` : ""}`, "");
  });

  p("## Redirect URIs and scopes", "");
  for (const c of g.redirectRules) p(`- ${claimLine(c)}`);
  p("", claimLine(g.scopes.model), "");
  if (g.scopes.examples.length) {
    p("| Scope | Grants | Tier |", "|---|---|---|");
    for (const e of g.scopes.examples)
      p(`| \`${e.scope}\`${e.seenInSource ? "" : " (not found verbatim in a retrieved page)"} | ${e.grants.replace(/\|/g, "\\|")} | ${e.tier ?? ""} |`);
    p("");
  }

  p("## Agent vs. human", "");
  p("An agent can investigate or prepare:", ...g.division.agentPrepares.map((t) => `- ${t}`), "");
  p("An agent can assist, but you must authorize:", ...g.division.agentAssists.map((t) => `- ${t}`), "");
  p("Only you can do:", ...g.division.humanOnly.map((t) => `- ${t}`), "");

  p("## Approval and risks", "");
  p(`**${REVIEW_LABEL[g.externalReview.requirement]}.** ${claimLine(g.externalReview.summary)}`, "");
  if (g.externalReview.triggers.length) {
    p("Review triggers:");
    for (const c of g.externalReview.triggers) p(`- ${claimLine(c)}`);
    p("");
  }
  for (const r of g.risks) p(`- **${r.kind[0].toUpperCase() + r.kind.slice(1)}:** ${claimLine(r)}`);
  p("");

  p("## Next actions", "");
  g.nextActions.forEach((a, i) => p(`${i + 1}. ${a}`));
  p("");

  if (g.unresolved.length) {
    p("## Unresolved questions", "");
    for (const u of g.unresolved) p(`- ${u}`);
    p("");
  }

  p("## Sources", "");
  const AUTH = { official: "official provider docs", composio: "Composio docs", third_party: "third-party page" } as const;
  for (const s of g.sources) p(`- **${s.id}** [${s.title}](${s.url}), ${AUTH[s.authority]}, retrieved ${formatDate(s.retrievedAt)}`);
  const failed = g.log.fetches.filter((f) => !f.ok);
  if (failed.length) {
    p("", "Pages that could not be retrieved:");
    for (const f of failed) p(`- ${f.url} (${f.detail})`);
  }
  const c = g.validation.counts;
  p("", `Claims: ${c.verified} verified, ${c.inferred} inferred, ${c.unknown} unknown${g.validation.thirdPartyOnly.length ? ` (${g.validation.thirdPartyOnly.length} verified claims rest only on third-party pages)` : ""}. Validator adjustments: ${g.validation.adjustments.length}.`, "");
  return out.join("\n");
}
