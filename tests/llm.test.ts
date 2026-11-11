import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, type GoogleGenAI } from "@google/genai";
import { describeModelError, geminiDriver, resetModelCooldown } from "../server/llm.ts";

type Chunk = { candidates: { content: { parts: { text: string; thought?: boolean }[] }; finishReason?: string }[] };

/** Fake Gen AI client: each model name maps to a behaviour for generateContentStream. */
function fakeClient(behaviour: Record<string, "hang" | "503" | "ok">, seen: string[]) {
  return {
    models: {
      async generateContentStream(req: { model: string; config?: { abortSignal?: AbortSignal } }) {
        seen.push(req.model);
        const b = behaviour[req.model];
        if (b === "503") throw new ApiError({ message: "overloaded", status: 503 });
        const signal = req.config?.abortSignal;
        return (async function* (): AsyncGenerator<Chunk> {
          if (b === "hang") {
            await new Promise((_r, reject) => signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }))));
          }
          yield { candidates: [{ content: { parts: [{ text: "thinking…", thought: true }] } }] };
          yield { candidates: [{ content: { parts: [{ text: '{"ok":' }] } }] };
          yield { candidates: [{ content: { parts: [{ text: "true}" }] }, finishReason: "STOP" }] };
        })();
      },
    },
  } as unknown as GoogleGenAI;
}

afterEach(() => {
  vi.unstubAllEnvs();
  resetModelCooldown();
});

describe("Gemini guide-writing request", () => {
  it("drops a model that sends nothing before the first-chunk deadline and uses the next", async () => {
    vi.stubEnv("GEMINI_FIRST_CHUNK_MS", "50");
    const seen: string[] = [];
    const llm = geminiDriver("a", fakeClient({ a: "hang", b: "ok" }, seen), ["a", "b"]);
    const t = Date.now();
    const out = await llm.json({ system: "s", user: "u", schema: {} });
    expect(out).toBe('{"ok":true}'); // thought parts are not part of the answer
    expect(seen).toEqual(["a", "b"]);
    expect(Date.now() - t).toBeLessThan(2000);
    expect(llm.model).toBe("b");
    expect(llm.calls).toBe(1);
  });

  it("moves past a 503 immediately", async () => {
    const seen: string[] = [];
    const llm = geminiDriver("a", fakeClient({ a: "503", b: "ok" }, seen), ["a", "b"]);
    expect(await llm.json({ system: "s", user: "u", schema: {} })).toBe('{"ok":true}');
    expect(seen).toEqual(["a", "b"]);
  });

  it("does not fall back or retry when the user cancels", async () => {
    vi.stubEnv("GEMINI_FIRST_CHUNK_MS", "5000");
    const seen: string[] = [];
    const llm = geminiDriver("a", fakeClient({ a: "hang", b: "ok" }, seen), ["a", "b"]);
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 30);
    await expect(llm.json({ system: "s", user: "u", schema: {}, signal: ctrl.signal })).rejects.toThrow();
    expect(seen).toEqual(["a"]);
  });
});

describe("model failures shown to the user", () => {
  it("names an exhausted daily quota and when it resets", () => {
    expect(describeModelError(new ApiError({ message: "GenerateRequestsPerDayPerProjectPerModel-FreeTier", status: 429 }))).toMatchObject({
      code: "model_rate_limit",
      message: expect.stringMatching(/midnight Pacific/),
    });
  });
  it("reports models that never answered as unavailable, not as a user cancel", () => {
    const e = Object.assign(new Error("gemini-x sent no response within the time limit"), { name: "TimeoutError" });
    expect(describeModelError(e)?.code).toBe("model_unavailable");
  });
});

describe("model cooldown across investigations", () => {
  it("starts the next investigation from a model that has not just failed", async () => {
    const seen: string[] = [];
    await geminiDriver("a", fakeClient({ a: "503", b: "ok" }, seen), ["a", "b"]).json({ system: "s", user: "u", schema: {} });
    const next = geminiDriver("a", fakeClient({ a: "503", b: "ok" }, seen), ["a", "b"]);
    expect(next.model).toBe("b");
    expect(next.skippedModels?.[0]).toMatch(/^a \(failed in the last 10 minutes/);
    await next.json({ system: "s", user: "u", schema: {} });
    expect(seen).toEqual(["a", "b", "b"]);
  });
});
