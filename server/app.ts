import { Hono } from "hono";
import { getConnInfo } from "@hono/node-server/conninfo";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GuideSchema, type Guide, type PipelineEvent } from "../shared/schema.ts";
import { hasModelCredentials, modelName } from "./llm.ts";
import { investigate } from "./pipeline.ts";
import { key } from "./resolve.ts";
import { isPublicAddress } from "./netguard.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
export const GUIDES_DIR = path.join(here, "..", "data", "guides");

/** Featured examples. Each was chosen for a different setup challenge; see EVIDENCE.md. */
export const EXAMPLES = [
  { slug: "github", name: "GitHub", blurb: "Self-serve registration, no review" },
  { slug: "gmail", name: "Gmail", blurb: "Consent screen and scope verification" },
  { slug: "slack", name: "Slack", blurb: "Workspace install and admin approval" },
  { slug: "shopify", name: "Shopify", blurb: "No managed app: bring your own" },
];

// Small in-memory protections so a public deployment cannot drain the model budget.
const WINDOW_MS = 60 * 60 * 1000;
const PER_IP = Number(process.env.RATE_LIMIT_PER_HOUR ?? 6);
const DAILY_CAP = Number(process.env.DAILY_LIVE_RUN_CAP ?? 60);
const hits = new Map<string, number[]>();
let day = "";
let dayCount = 0;
const cache = new Map<string, { at: number; guide: Guide }>();
const CACHE_TTL = 6 * 60 * 60 * 1000;

/**
 * Which address the per-IP limit counts against. X-Forwarded-For is client-controlled except for the
 * entries appended by proxies we actually sit behind, so only the entry TRUSTED_PROXY_HOPS from the
 * right is used (Render's proxy appends exactly one). With no trusted proxy, the socket address is
 * used and forwarded headers are ignored. CF-Connecting-IP is never trusted: we are not behind a
 * Cloudflare deployment we control, so a client could set it to anything.
 */
export function clientAddress(forwardedFor: string | undefined, socketAddress: string | undefined, trustedHops: number): string {
  if (trustedHops > 0 && forwardedFor) {
    const chain = forwardedFor.split(",").map((s) => s.trim()).filter(Boolean);
    const pick = chain[chain.length - trustedHops];
    if (pick) return pick;
  }
  return socketAddress ?? "unknown";
}
// Render sets RENDER=true and its proxy appends one X-Forwarded-For entry.
const TRUSTED_HOPS = Number(process.env.TRUSTED_PROXY_HOPS ?? (process.env.RENDER ? 1 : 0));

export function allow(ip: string): string | null {
  const now = Date.now();
  const today = new Date().toISOString().slice(0, 10);
  if (today !== day) {
    day = today;
    dayCount = 0;
  }
  if (dayCount >= DAILY_CAP) return "This demo has reached its daily limit for live investigations. Saved investigations still open.";
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= PER_IP) return `Limit of ${PER_IP} live investigations per hour reached for your address. Try again later.`;
  recent.push(now);
  hits.set(ip, recent);
  dayCount++;
  return null;
}

async function loadSaved(slug: string): Promise<Guide | null> {
  if (!/^[a-z0-9_\-]+$/.test(slug)) return null;
  try {
    const raw = JSON.parse(await readFile(path.join(GUIDES_DIR, `${slug}.json`), "utf8"));
    const parsed = GuideSchema.safeParse(raw);
    return parsed.success ? { ...parsed.data, meta: { ...parsed.data.meta, origin: "saved" } } : null;
  } catch {
    return null;
  }
}

export function createApp() {
  const app = new Hono();

  app.get("/api/health", (c) =>
    c.json({ ok: true, liveResearch: hasModelCredentials(), model: hasModelCredentials() ? modelName() : null }),
  );

  app.get("/api/examples", async (c) => {
    const files = await readdir(GUIDES_DIR).catch(() => [] as string[]);
    const saved = new Set(files.filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, "")));
    const out = [];
    for (const e of EXAMPLES) {
      const g = saved.has(e.slug) ? await loadSaved(e.slug) : null;
      out.push({ ...e, saved: Boolean(g), investigatedAt: g?.meta.investigatedAt ?? null });
    }
    return c.json({ examples: out });
  });

  app.get("/api/guides/:slug", async (c) => {
    const guide = await loadSaved(c.req.param("slug"));
    return guide ? c.json({ guide }) : c.json({ error: "No saved investigation for this provider." }, 404);
  });

  app.post("/api/investigate", async (c) => {
    const body = await c.req.json().catch(() => null);
    const query = typeof body?.query === "string" ? body.query.trim() : "";
    const fresh = body?.fresh === true;
    if (query.length < 2 || query.length > 80) {
      return c.json({ error: "Enter a provider name between 2 and 80 characters." }, 400);
    }

    const cacheKey = key(query);
    const cached = cache.get(cacheKey);
    const useCache = !fresh && cached && Date.now() - cached.at < CACHE_TTL;
    if (!useCache && hasModelCredentials()) {
      let socket: string | undefined;
      try {
        socket = getConnInfo(c).remote.address;
      } catch {
        socket = undefined; // not running on the Node adapter (tests)
      }
      const xff = c.req.header("x-forwarded-for");
      const ip = clientAddress(xff, socket, TRUSTED_HOPS);
      // Diagnostic without logging addresses: which entries are public, and where the edge's own client header sits.
      const chain = (xff ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      const edge = c.req.header("cf-connecting-ip");
      console.log(
        `[ratelimit] forwarded-for entries: ${chain.length} (${chain.map((a) => (isPublicAddress(a) ? "public" : "private")).join(",")}), ` +
          `cf-connecting-ip at index: ${edge ? chain.indexOf(edge) : "absent"}, trusted hops: ${TRUSTED_HOPS}, picked index: ${chain.indexOf(ip)}`,
      );
      const blocked = allow(ip);
      if (blocked) return c.json({ error: blocked }, 429);
    }

    const encoder = new TextEncoder();
    const abort = new AbortController();
    c.req.raw.signal.addEventListener("abort", () => abort.abort());
    const overall = setTimeout(() => abort.abort(), 8 * 60 * 1000);

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let open = true;
        const send = (event: PipelineEvent) => {
          if (!open) return;
          try {
            controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
          } catch {
            open = false;
          }
        };
        const ping = setInterval(() => send({ type: "ping" }), 10000);
        try {
          if (useCache) {
            // A repeat of an investigation this server already ran: replay its result, labelled as such.
            const guide = GuideSchema.parse(cached.guide);
            send({ type: "composio", facts: guide.composio });
            send({ type: "result", guide });
          } else {
            const outcome = await investigate(query, send, abort.signal, { fresh });
            if (outcome.kind === "guide") cache.set(cacheKey, { at: Date.now(), guide: outcome.guide });
          }
        } catch (err) {
          // investigate() reports its own failures; this covers the replay path and anything unexpected,
          // so the client always receives a terminal event instead of a silently closed stream.
          if (useCache) cache.delete(cacheKey);
          send({ type: "error", code: "internal", message: err instanceof Error ? err.message.slice(0, 240) : "Unexpected server error." });
        } finally {
          clearInterval(ping);
          clearTimeout(overall);
          open = false;
          try {
            controller.close();
          } catch {
            /* already closed by the client */
          }
        }
      },
      cancel() {
        abort.abort();
      },
    });

    return new Response(stream, {
      headers: {
        "content-type": "application/x-ndjson; charset=utf-8",
        "cache-control": "no-store, no-transform",
        "x-accel-buffering": "no",
      },
    });
  });

  return app;
}
