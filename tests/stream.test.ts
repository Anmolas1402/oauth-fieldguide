import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../server/app.ts";
import type { PipelineEvent } from "../shared/schema.ts";

async function readEvents(res: Response): Promise<PipelineEvent[]> {
  const text = await res.text();
  expect(text.endsWith("\n")).toBe(true); // every event is a complete NDJSON line
  return text.trim().split("\n").map((l) => JSON.parse(l));
}

const post = (body: unknown) =>
  createApp().request("/api/investigate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("POST /api/investigate", () => {
  it("rejects a missing or oversized query with JSON, not a stream", async () => {
    for (const body of [{}, { query: "x" }, { query: "x".repeat(81) }]) {
      const res = await post(body);
      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/between 2 and 80/);
    }
  });

  it("ends with exactly one terminal error event when an upstream fetch fails", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("GOOGLE_API_KEY", "");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    const res = await post({ query: "some provider" });
    expect(res.headers.get("content-type")).toMatch(/application\/x-ndjson/);
    const events = await readEvents(res);
    const terminal = events.filter((e) => e.type === "error" || e.type === "result" || e.type === "no_oauth");
    expect(terminal).toHaveLength(1);
    expect(events.at(-1)).toMatchObject({ type: "error", stage: "resolve" });
    expect(events).toContainEqual(expect.objectContaining({ type: "stage", id: "resolve", state: "failed" }));
  });
});
