import { beforeEach, describe, expect, it } from "vitest";
import type { Activity, ComposioFacts } from "../shared/schema.ts";
import { checkDraft, composeGuide } from "../server/compose.ts";
import type { LLM, ToolCall, ToolLoopOptions, ToolResult } from "../server/llm.ts";
import { BUDGET, PipelineError, runResearch } from "../server/research.ts";
import { resetSearchState } from "../server/search.ts";
import { makeDraft } from "./fixtures.ts";

const LONG = "Register your app in the Acme Developer Portal. Redirect URIs must use HTTPS and must match exactly. ".repeat(6);
const composio: ComposioFacts = { listed: true, name: "Acme", slug: "ACME", category: null, authSchemes: ["OAUTH2"], managedOAuth: false, catalogueList: "byo", customGuideUrl: null, faq: [], matchNote: null, alternatives: [] };

/** Fake network: two docs pages, one redirect to an already-read page, one 404, and a search engine. */
const fakeFetch = (async (input: string | URL) => {
  const url = String(input);
  const html = (title: string, body: string) =>
    new Response(`<html><head><title>${title}</title></head><body><main><p>${body}</p></main></body></html>`, { headers: { "content-type": "text/html" } });
  if (url.startsWith("https://html.duckduckgo.com/"))
    return new Response(`<a class="result__a" href="https://developers.acme.dev/oauth">Acme OAuth</a><a class="result__snippet">Register an app</a>`, { headers: { "content-type": "text/html" } });
  if (url === "https://developers.acme.dev/oauth") return html("Acme OAuth", LONG);
  if (url === "https://developers.acme.dev/review") return html("Acme review", "Apps requesting payments scopes are reviewed before launch. ".repeat(8));
  if (url === "https://developers.acme.dev/old") return new Response(null, { status: 301, headers: { location: "https://developers.acme.dev/oauth" } });
  return new Response("not found", { status: 404 });
}) as typeof fetch;

/** A model that follows a script: each entry is one turn's tool calls; then it writes notes. */
function scriptedLLM(turns: Array<Array<Omit<ToolCall, "id">>>, notes = "PROVIDER: Acme | STATUS: identified\nnotes"): LLM & { results: ToolResult[][]; loops: string[] } {
  const results: ToolResult[][] = [];
  const loops: string[] = [];
  return {
    provider: "gemini",
    model: "fake",
    results,
    loops,
    async toolLoop(opts: ToolLoopOptions) {
      loops.push(opts.user);
      if (loops.length > 1) return { text: notes ? notes + " (second pass)" : "", turns: 1, stop: "done" };
      for (let t = 0; t < turns.length && t < opts.maxTurns; t++) {
        results.push(await opts.execute(turns[t].map((c, i) => ({ ...c, id: `t${t}c${i}` }))));
      }
      return { text: notes, turns: turns.length + 1, stop: "done" };
    },
    async json() {
      throw new Error("not used");
    },
  };
}

describe("research loop", () => {
  beforeEach(() => resetSearchState());

  it("executes real tool calls, numbers sources, and logs failures", async () => {
    const llm = scriptedLLM([
      [{ name: "search_web", args: { query: "acme oauth app registration" } }],
      [
        { name: "fetch_page", args: { url: "https://developers.acme.dev/oauth" } },
        { name: "fetch_page", args: { url: "https://developers.acme.dev/review" } },
        { name: "fetch_page", args: { url: "https://developers.acme.dev/missing" } },
        { name: "fetch_page", args: { url: "http://127.0.0.1/admin" } },
      ],
      [
        { name: "fetch_page", args: { url: "https://developers.acme.dev/old" } },
        { name: "fetch_page", args: { url: "https://developers.acme.dev/oauth" } },
        { name: "delete_everything", args: {} },
      ],
    ]);
    const activities: Activity[] = [];
    const seed = [{ id: "S1", url: "https://docs.composio.dev/toolkits/acme", title: "Acme toolkit", kind: "composio" as const, retrievedAt: "", chars: 10, truncated: false, text: "x" }];
    const r = await runResearch({ llm, providerName: "Acme", query: "acme", composio, seedSources: seed, emit: (a) => activities.push(a), fetchImpl: fakeFetch });

    expect(r.ledger.map((s) => `${s.id} ${s.url}`)).toEqual([
      "S1 https://docs.composio.dev/toolkits/acme",
      "S2 https://developers.acme.dev/oauth",
      "S3 https://developers.acme.dev/review",
    ]);
    expect(r.log.searches).toEqual([{ query: "acme oauth app registration", results: [{ url: "https://developers.acme.dev/oauth", title: "Acme OAuth" }] }]);
    expect(r.log.fetches.filter((f) => !f.ok).map((f) => f.detail).sort()).toEqual(["HTTP 404", "only https URLs are fetched"]);

    const [turn2, turn3] = [llm.results[1], llm.results[2]];
    expect(turn2[0].output).toMatch(/^SOURCE S2\n/);
    expect(turn2[2].isError).toBe(true);
    expect(turn3[0].output).toMatch(/already retrieved as source S2/);
    expect(turn3[1].output).toMatch(/Already retrieved as source S2/);
    expect(turn3[2]).toMatchObject({ isError: true, output: expect.stringMatching(/Unknown tool/) });

    // Every activity that started also finished, so progress never shows a fake "done".
    const finalState = new Map(activities.map((a) => [a.id, a.state]));
    expect([...finalState.values()].every((s) => s !== "running")).toBe(true);
    expect(activities.filter((a) => a.state === "failed").length).toBe(2);
  });

  it("asks for a second pass when too few provider pages were read, and says so", async () => {
    const llm = scriptedLLM([[{ name: "fetch_page", args: { url: "https://developers.acme.dev/oauth" } }]]);
    const activities: Activity[] = [];
    const r = await runResearch({ llm, providerName: "Acme", query: "acme", composio, seedSources: [], emit: (a) => activities.push(a), fetchImpl: fakeFetch });
    expect(llm.loops).toHaveLength(2);
    expect(llm.loops[1]).toContain("S1 https://developers.acme.dev/oauth");
    expect(activities.some((a) => a.kind === "note" && /Only 1 provider pages/.test(a.label))).toBe(true);
    expect(r.notes).toMatch(/second pass/);
  });

  it("does not ask for a second pass for a provider it could not identify", async () => {
    const llm = scriptedLLM([], "PROVIDER: Zzqqx | STATUS: not_identified");
    const r = await runResearch({ llm, providerName: "Zzqqx", query: "zzqqx", composio, seedSources: [], emit: () => {}, fetchImpl: fakeFetch });
    expect(r.notes).toMatch(/not_identified/);
    expect(llm.loops).toHaveLength(1);
  });

  it("enforces the page budget", async () => {
    const calls = Array.from({ length: BUDGET.fetches + 3 }, (_, i) => ({ name: "fetch_page", args: { url: `https://developers.acme.dev/p${i}` } }));
    const llm = scriptedLLM([calls]);
    const r = await runResearch({ llm, providerName: "Acme", query: "acme", composio, seedSources: [], emit: () => {}, fetchImpl: fakeFetch });
    expect(r.log.fetches.filter((f) => f.detail.includes("budget")).length).toBe(3);
    expect(llm.results[0].filter((x) => /budget spent/.test(x.output)).length).toBe(3);
  });

  it("rejects malformed tool arguments without executing them", async () => {
    const llm = scriptedLLM([[{ name: "fetch_page", args: { link: "https://x.dev" } }, { name: "search_web", args: {} }]]);
    await runResearch({ llm, providerName: "Acme", query: "acme", composio, seedSources: [], emit: () => {}, fetchImpl: fakeFetch });
    expect(llm.results[0].every((x) => x.isError && /Invalid arguments/.test(x.output))).toBe(true);
  });

  it("fails clearly when nothing was retrieved and no notes were written", async () => {
    const llm = scriptedLLM([], "");
    await expect(runResearch({ llm, providerName: "Acme", query: "acme", composio, seedSources: [], emit: () => {}, fetchImpl: fakeFetch })).rejects.toBeInstanceOf(PipelineError);
  });
});

describe("guide composition", () => {
  const ledger = [{ id: "S1", url: "https://x.dev", title: "x", kind: "provider_page" as const, retrievedAt: "", chars: 1, truncated: false, text: "x" }];
  const jsonLLM = (replies: string[]): LLM & { prompts: string[] } => {
    const prompts: string[] = [];
    return {
      provider: "gemini",
      model: "fake",
      prompts,
      async toolLoop() {
        throw new Error("not used");
      },
      async json(o) {
        prompts.push(o.user);
        return replies[prompts.length - 1] ?? "";
      },
    };
  };
  const args = (llm: LLM) => ({ llm, providerName: "Acme", query: "acme", composio, notes: "n", ledger });

  it("accepts schema-valid JSON, including inside a code fence", async () => {
    const llm = jsonLLM(["```json\n" + JSON.stringify(makeDraft()) + "\n```"]);
    expect((await composeGuide(args(llm))).provider.name).toBe("Acme");
  });
  it("retries once with the validation error, then succeeds", async () => {
    const bad = { ...makeDraft(), difficulty: { level: "extreme", rationale: "" } };
    const llm = jsonLLM([JSON.stringify(bad), JSON.stringify(makeDraft())]);
    await composeGuide(args(llm));
    expect(llm.prompts[1]).toMatch(/previous answer was rejected: schema mismatch at difficulty.level/);
  });
  it("gives up after the retry instead of returning an invalid guide", async () => {
    const llm = jsonLLM(["not json", "{}"]);
    await expect(composeGuide(args(llm))).rejects.toThrow(/did not match the schema/);
  });
  it("sends the model only source ids that were retrieved", async () => {
    const llm = jsonLLM([JSON.stringify(makeDraft())]);
    await composeGuide(args(llm));
    expect(llm.prompts[0]).toContain('<source id="S1"');
    expect(checkDraft("[]").ok).toBe(false);
  });
});
