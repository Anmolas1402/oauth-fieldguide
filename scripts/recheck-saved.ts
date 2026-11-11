/**
 * Applies validator rules that need only the guide itself (not the retrieved page text) to saved
 * guides, so a rule added after a run also covers that run. Each change is recorded as an
 * adjustment that says it was applied afterwards.
 *   npx tsx scripts/recheck-saved.ts
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { GUIDES_DIR } from "../server/app.ts";
import { CONSOLE_ACTION_RE, DURATION_RE } from "../server/verify.ts";
import { classifySource } from "../server/authority.ts";
import { eachClaim } from "../shared/schema.ts";
import { GuideSchema } from "../shared/schema.ts";

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ");
for (const f of (await readdir(GUIDES_DIR)).filter((x) => x.endsWith(".json"))) {
  const file = path.join(GUIDES_DIR, f);
  const g = GuideSchema.parse(JSON.parse(await readFile(file, "utf8")));
  const note = " (rule applied to the saved guide after the run)";
  let changed = 0;
  const tl = g.externalReview.publishedTimeline;
  if (tl.status === "verified" && tl.quote) {
    const unsupported = [...tl.text.matchAll(new RegExp(DURATION_RE.source, "gi"))].map((m) => m[0]).filter((d) => !norm(tl.quote!).includes(norm(d)));
    if (unsupported.length) {
      g.validation.adjustments.push({ path: "externalReview.publishedTimeline", change: "removed unsupported duration", reason: `${unsupported.map((d) => `"${d}"`).join(", ")} is not in the quoted text, so only the quote is kept${note}` });
      tl.text = `The provider states: "${tl.quote}"`;
      changed++;
    }
  }
  g.steps.forEach((s, i) => {
    if (s.actor === "agent_prepares" && CONSOLE_ACTION_RE.test(`${s.title} ${s.action}`)) {
      s.actor = "agent_assists";
      g.validation.adjustments.push({ path: `steps[${i}].actor`, change: "agent can prepare → agent assists", reason: `the step is performed inside a logged-in dashboard or console${note}` });
      changed++;
    }
  });
  // Publisher labels need only each source's URL.
  const raw = JSON.parse(await readFile(file, "utf8"));
  if (!raw.sources?.every((s: { authority?: string }) => s.authority)) {
    for (const s of g.sources) s.authority = s.kind === "composio" ? "composio" : classifySource(s.url, g.provider.name, g.composio.slug);
    const byId = new Map(g.sources.map((s) => [s.id, s]));
    g.validation.thirdPartyOnly = [];
    eachClaim(g, (c, p) => {
      if (c.status === "verified" && c.sourceIds.length && c.sourceIds.every((id) => byId.get(id)?.authority === "third_party")) g.validation.thirdPartyOnly.push(p);
    });
    g.validation.officialPagesRead = g.sources.filter((s) => s.authority === "official").length;
    changed++;
  }
  if (changed) await writeFile(file, JSON.stringify(g, null, 2) + "\n");
  console.log(`${f}: ${changed} change(s)`);
}
