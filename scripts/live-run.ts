/**
 * Runs one real investigation through the same pipeline the server uses and records what happened:
 * outcome, every stage, every page fetched (and whether it was the provider's own docs), model calls,
 * and the incomplete-investigation gaps. Writes evidence/live-runs/<query>-<date>.json.
 *
 *   npx tsx scripts/live-run.ts "<provider>"
 */
import "dotenv/config";
import { config } from "dotenv";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { investigationGaps } from "../shared/derive.ts";
import type { PipelineEvent } from "../shared/schema.ts";
import { investigate } from "../server/pipeline.ts";

config({ path: ".env.local", override: true, quiet: true });

const query = process.argv.slice(2).join(" ").trim();
if (!query) throw new Error("usage: live-run.ts <provider>");

const events: PipelineEvent[] = [];
const modelLines: string[] = [];
const origLog = console.log;
console.log = (...a: unknown[]) => {
  const line = a.map(String).join(" ");
  if (line.startsWith("[investigate]")) modelLines.push(line);
  origLog(...a);
};

const started = new Date();
const outcome = await investigate(query, (e) => {
  if (e.type === "ping") return;
  events.push(e);
  if (e.type === "stage") origLog(`  ${e.id}: ${e.state}${e.detail ? ` (${e.detail})` : ""}`);
  if (e.type === "error") origLog(`  ERROR ${e.code}: ${e.message}`);
}, undefined, { fresh: true });

const g = outcome.kind === "guide" ? outcome.guide : null;
const fetches = g?.log.fetches ?? [];
const summary = {
  query,
  startedAt: started.toISOString(),
  durationMs: Date.now() - started.getTime(),
  outcome: outcome.kind,
  error: events.find((e) => e.type === "error") ?? null,
  model: g?.meta.model ?? null,
  modelCalls: modelLines,
  composio: g?.composio
    ? { slug: g.composio.slug, managedOAuth: g.composio.managedOAuth, catalogueList: g.composio.catalogueList }
    : null,
  searches: g?.log.searches.map((s) => ({ query: s.query, results: s.results.length })) ?? [],
  pagesRetrieved: g?.sources.filter((s) => s.kind === "provider_page").map((s) => ({ id: s.id, url: s.url, authority: s.authority })) ?? [],
  fetchFailures: fetches.filter((f) => !f.ok).map((f) => ({ url: f.url, detail: f.detail })),
  officialPagesRead: g?.validation.officialPagesRead ?? 0,
  counts: g?.validation.counts ?? null,
  steps: g?.steps.map((s) => `${s.title} [${s.status}, ${s.actor}]`) ?? [],
  review: g ? { requirement: g.externalReview.requirement, timeline: g.externalReview.publishedTimeline.status } : null,
  validatorAdjustments: g?.validation.adjustments.length ?? 0,
  thirdPartyOnly: g?.validation.thirdPartyOnly ?? [],
  incompleteGaps: g ? investigationGaps(g) : null,
  unresolved: g?.unresolved ?? [],
};
const dir = path.join("evidence", "live-runs");
await mkdir(dir, { recursive: true });
const file = path.join(dir, `${query.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${started.toISOString().slice(0, 10)}.json`);
await writeFile(file, JSON.stringify({ summary, events: events.filter((e) => e.type !== "result"), guide: g }, null, 2) + "\n");
origLog(JSON.stringify(summary, null, 2));
origLog(`saved ${file}`);
