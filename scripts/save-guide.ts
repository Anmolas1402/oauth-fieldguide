/**
 * Runs the real pipeline for one provider and stores the result under data/guides/.
 * Saved guides are what the example chips open instantly; they are labelled with their
 * investigation date in the UI and can always be re-run live.
 *
 *   npm run save-guide -- github
 */
import { config } from "dotenv";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { GUIDES_DIR } from "../server/app.ts";
import { investigate } from "../server/pipeline.ts";

config({ path: ".env.local", override: true, quiet: true });
config({ quiet: true });

const query = process.argv[2];
const fresh = process.argv.includes("--fresh");
if (!query) {
  console.error("usage: npm run save-guide -- <provider>");
  process.exit(1);
}
const outcome = await investigate(query, (e) => {
  if (e.type === "stage") console.log(`[${e.id}] ${e.state}${e.detail ? `: ${e.detail}` : ""}`);
  if (e.type === "activity") console.log(`   ${e.activity.kind} ${e.activity.state}: ${e.activity.label}${e.activity.detail ? ` (${e.activity.detail})` : ""}`);
  if (e.type === "error") console.error(`ERROR ${e.code}: ${e.message}`);
}, undefined, { fresh });
if (outcome.kind !== "guide") process.exit(1);
await mkdir(GUIDES_DIR, { recursive: true });
const file = path.join(GUIDES_DIR, `${query.toLowerCase().replace(/[^a-z0-9]+/g, "_")}.json`);
await writeFile(file, JSON.stringify(outcome.guide, null, 2) + "\n");
console.log(`saved ${file}`);
for (const a of outcome.guide.validation.adjustments) console.log(`adjustment: ${a.path}: ${a.change} (${a.reason})`);
