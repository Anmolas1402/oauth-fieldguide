import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ResearchResult } from "./research.ts";

/**
 * Research that finished but whose guide was not written (for example the model was overloaded at
 * the guide-writing step) is kept for six hours, so a retry does not spend the model quota again.
 * It lives in the OS temp directory, never in the repository, and is deleted once a guide is made.
 */
const DIR = path.join(os.tmpdir(), "oauth-fieldguide-research");
const TTL_MS = 6 * 60 * 60 * 1000;
const file = (key: string) => path.join(DIR, `${key.replace(/[^a-z0-9_-]+/gi, "_").slice(0, 80)}.json`);

export async function readResearchCache(key: string): Promise<{ at: number; research: ResearchResult } | null> {
  try {
    const raw = JSON.parse(await readFile(file(key), "utf8"));
    if (typeof raw?.at !== "number" || Date.now() - raw.at > TTL_MS || !raw.research?.ledger) return null;
    return raw;
  } catch {
    return null;
  }
}

export async function writeResearchCache(key: string, research: ResearchResult): Promise<void> {
  try {
    await mkdir(DIR, { recursive: true });
    await writeFile(file(key), JSON.stringify({ at: Date.now(), research }));
  } catch {
    /* caching is best effort */
  }
}

export async function clearResearchCache(key: string): Promise<void> {
  await rm(file(key), { force: true }).catch(() => {});
}
