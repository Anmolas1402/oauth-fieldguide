/**
 * After the quote matcher changes, re-checks claims in saved guides that the validator had
 * downgraded from "verified" to "inferred". For each one, the cited pages are retrieved again and
 * the original quote (kept in the adjustment record) is checked with the current matcher. A claim is
 * restored only when the full quote is found; the restoration is recorded as its own adjustment.
 *
 *   npx tsx scripts/recheck-quotes.ts            # report only
 *   npx tsx scripts/recheck-quotes.ts --write    # apply
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { GUIDES_DIR } from "../server/app.ts";
import { fetchPage } from "../server/fetchPage.ts";
import { quoteFound } from "../server/verify.ts";
import { GuideSchema, eachClaim, type Claim, type Guide } from "../shared/schema.ts";

const write = process.argv.includes("--write");
const today = new Date().toISOString().slice(0, 10);

function claimAt(g: Guide, p: string): Claim | null {
  let found: Claim | null = null;
  eachClaim(g, (c, cp) => {
    if (cp === p) found = c;
  });
  return found;
}

for (const f of (await readdir(GUIDES_DIR)).filter((x) => x.endsWith(".json"))) {
  const file = path.join(GUIDES_DIR, f);
  const g = GuideSchema.parse(JSON.parse(await readFile(file, "utf8")));
  const byId = new Map(g.sources.map((s) => [s.id, s]));
  let restored = 0;
  for (const a of [...g.validation.adjustments]) {
    if (a.change !== "verified → inferred") continue;
    const m = a.reason.match(/not found in the cited page: "([\s\S]*)"$/);
    if (!m || m[1].endsWith("…")) continue; // quote not recorded, or recorded truncated
    const quote = m[1];
    const claim = claimAt(g, a.path);
    if (!claim || claim.status !== "inferred") continue;
    let hit: string | null = null;
    for (const id of claim.sourceIds) {
      const src = byId.get(id);
      if (!src) continue;
      const page = await fetchPage(src.url);
      if (page.ok && quoteFound(quote, page.text)) {
        hit = id;
        break;
      }
    }
    console.log(`${f} ${a.path}: ${hit ? `quote found in ${hit}` : "still not found"}`);
    if (!hit) continue;
    claim.status = "verified";
    claim.quote = quote;
    claim.sourceIds = [hit];
    g.validation.adjustments.push({
      path: a.path,
      change: "inferred → verified",
      reason: `re-checked on ${today} after a quote-matching fix: the quote is in ${hit} (page retrieved again on that date)`,
    });
    restored++;
  }
  if (restored) {
    const counts = { verified: 0, inferred: 0, unknown: 0 };
    eachClaim(g, (c) => counts[c.status]++);
    g.validation.counts = counts;
    if (write) await writeFile(file, JSON.stringify(g, null, 2) + "\n");
  }
  console.log(`${f}: ${restored} restored${restored && !write ? " (dry run)" : ""}`);
}
