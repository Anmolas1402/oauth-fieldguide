import Anthropic from "@anthropic-ai/sdk";
import { ApiError, GoogleGenAI, ThinkingLevel, type Content, type Part } from "@google/genai";

/**
 * The two things the pipeline needs from a model, behind one interface so the research loop,
 * the guide writer and the tests do not depend on a vendor SDK.
 *
 * Search and page retrieval are tools this server executes for every provider, so both drivers
 * see exactly the same evidence and the server keeps the text of every page that was read.
 */

export type ToolDef = {
  name: string;
  description: string;
  /** JSON Schema for the tool's arguments. */
  parameters: Record<string, unknown>;
};

export type ToolCall = { id: string; name: string; args: Record<string, unknown> };
export type ToolResult = { id: string; name: string; output: string; isError?: boolean };

export type ToolLoopOptions = {
  system: string;
  user: string;
  tools: ToolDef[];
  /** Runs one turn's calls (in parallel); the results are sent back to the model. */
  execute: (calls: ToolCall[]) => Promise<ToolResult[]>;
  maxTurns: number;
  signal?: AbortSignal;
};

export type ToolLoopResult = { text: string; turns: number; stop: "done" | "max_turns" };

export type JsonOptions = {
  system: string;
  user: string;
  /** JSON Schema the output must follow. */
  schema: Record<string, unknown>;
  signal?: AbortSignal;
};

export interface LLM {
  provider: "gemini" | "anthropic";
  /** The model currently in use (it can change if an overloaded model is skipped). */
  readonly model: string;
  /** Models that were skipped because they were overloaded or out of quota. */
  readonly skippedModels?: string[];
  /** Successful model requests made through this driver. */
  readonly calls?: number;
  toolLoop(opts: ToolLoopOptions): Promise<ToolLoopResult>;
  /** Returns the raw JSON text; the caller validates it. */
  json(opts: JsonOptions): Promise<string>;
}

/** A model-side stop that is not a transport error: refusal, safety block, truncation. */
export class ModelStopError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

// ---------------------------------------------------------------------------------------------
// Provider selection. Keys are read from the server environment only and never reach the browser.

export const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";
/** Tried in order when GEMINI_MODEL is not set. Free-tier models are often overloaded (503). */
export const GEMINI_FALLBACK_MODELS = ["gemini-3.8-flash", "gemini-3.6-flash", "gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite"];
export const DEFAULT_ANTHROPIC_MODEL = "claude-opus-5-5";

const env = (k: string) => process.env[k]?.trim() || "";
const geminiKey = () => env("GEMINI_API_KEY") || env("GOOGLE_API_KEY");

export function activeProvider(): "gemini" | "anthropic" | null {
  const forced = env("MODEL_PROVIDER").toLowerCase();
  if (forced === "gemini") return geminiKey() ? "gemini" : null;
  if (forced === "anthropic") return env("ANTHROPIC_API_KEY") ? "anthropic" : null;
  if (geminiKey()) return "gemini";
  if (env("ANTHROPIC_API_KEY")) return "anthropic";
  return null;
}

export function hasModelCredentials(): boolean {
  return activeProvider() !== null;
}

export function modelName(): string | null {
  const p = activeProvider();
  if (p === "gemini") return env("GEMINI_MODEL") || DEFAULT_GEMINI_MODEL;
  if (p === "anthropic") return env("ANTHROPIC_MODEL") || DEFAULT_ANTHROPIC_MODEL;
  return null;
}

/** A fresh driver per investigation, so model fallback state does not carry over between runs. */
export function getLLM(): LLM {
  const p = activeProvider();
  const model = modelName();
  if (!p || !model) throw new Error("No model API key is configured.");
  return p === "gemini" ? geminiDriver(model) : anthropicDriver(model);
}

// ---------------------------------------------------------------------------------------------
// Gemini (Google Gen AI SDK, generateContent)

const GEMINI_BLOCKED = new Set(["SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII", "RECITATION", "IMAGE_SAFETY"]);

function geminiThinking(fallback: ThinkingLevel): ThinkingLevel {
  const v = env("GEMINI_THINKING").toUpperCase();
  return (Object.values(ThinkingLevel) as string[]).includes(v) ? (v as ThinkingLevel) : fallback;
}

export function geminiDriver(model: string, client?: GoogleGenAI, candidates?: string[]): LLM {
  // Few SDK retries: an overloaded model is better answered by moving to the next candidate.
  const ai = client ?? new GoogleGenAI({ apiKey: geminiKey(), httpOptions: { retryOptions: { attempts: 1 } } });
  const models = candidates ?? (env("GEMINI_MODEL") ? [model] : GEMINI_FALLBACK_MODELS);
  let current = 0;
  let calls = 0;
  const skipped: string[] = [];

  /** Calls the current model; on overload, quota or missing model, moves on and stays on the one that answered. */
  type Params = Omit<Parameters<typeof ai.models.generateContent>[0], "model">;

  /** Overloaded, out of quota, server error, or our own request timeout (not a user cancel). */
  const isTransient = (err: unknown, params: Params) => {
    if (params.config?.abortSignal?.aborted) return false;
    if (err instanceof ApiError) return [404, 429, 500, 502, 503, 504].includes(err.status);
    return err instanceof Error && /abort|timeout|timed out|fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|socket hang up|network/i.test(`${err.name} ${err.message}`);
  };
  const statusOf = (err: unknown) =>
    err instanceof ApiError ? `HTTP ${err.status}` : err instanceof Error && /fetch failed|ECONN|ENOTFOUND|socket|network/i.test(err.message) ? "network error" : "timed out";

  /**
   * For a standalone request (no conversation state), any candidate model will do: try each in
   * turn, starting with the one in use, for a few rounds with backoff.
   */
  const generateAnyModel = async (params: Params) => {
    let lastErr: unknown;
    for (let round = 0; round < 3; round++) {
      for (let k = 0; k < models.length; k++) {
        const i = (current + k) % models.length;
        try {
          const res = await ai.models.generateContent({ ...params, model: models[i] });
          calls++;
          if (i !== current) {
            skipped.push(`${models[current]} (unavailable for the guide-writing step)`);
            current = i;
          }
          return res;
        } catch (err) {
          if (!isTransient(err, params)) throw err;
          lastErr = err;
        }
      }
      await new Promise((r) => setTimeout(r, 8000 * (round + 1)));
    }
    throw lastErr;
  };

  const generate = async (params: Params) => {
    let lastModelRetries = 0;
    for (;;) {
      try {
        const res = await ai.models.generateContent({ ...params, model: models[current] });
        calls++;
        return res;
      } catch (err) {
        if (!isTransient(err, params)) throw err;
        if (current < models.length - 1) {
          skipped.push(`${models[current]} (${statusOf(err)})`);
          current++;
          continue;
        }
        if (lastModelRetries < 2) {
          lastModelRetries++;
          await new Promise((r) => setTimeout(r, 4000 * lastModelRetries));
          continue;
        }
        throw err;
      }
    }
  };

  const checkStop = (res: { candidates?: { finishReason?: string; content?: Content }[]; promptFeedback?: { blockReason?: string } }) => {
    if (res.promptFeedback?.blockReason) {
      throw new ModelStopError("model_refusal", `The model blocked the request (${res.promptFeedback.blockReason}).`);
    }
    const reason = res.candidates?.[0]?.finishReason;
    if (reason && GEMINI_BLOCKED.has(reason)) {
      throw new ModelStopError("model_refusal", `The model stopped for a content policy reason (${reason}).`);
    }
    return reason;
  };

  return {
    provider: "gemini",
    get model() {
      return models[current];
    },
    get skippedModels() {
      return [...skipped];
    },
    get calls() {
      return calls;
    },
    async toolLoop(opts) {
      const contents: Content[] = [{ role: "user", parts: [{ text: opts.user }] }];
      const functionDeclarations = opts.tools.map((t) => ({ name: t.name, description: t.description, parametersJsonSchema: t.parameters }));
      let text = "";
      for (let turn = 1; turn <= opts.maxTurns; turn++) {
        const res = await generate({
          contents,
          config: {
            systemInstruction: opts.system,
            tools: [{ functionDeclarations }],
            thinkingConfig: { thinkingLevel: geminiThinking(ThinkingLevel.LOW) },
            maxOutputTokens: 16000,
            httpOptions: { timeout: 120_000 },
            abortSignal: opts.signal,
          },
        });
        const reason = checkStop(res);
        const content = res.candidates?.[0]?.content;
        const parts: Part[] = content?.parts ?? [];
        const turnText = parts.filter((p) => typeof p.text === "string" && !p.thought).map((p) => p.text).join("").trim();
        if (turnText) text = turnText;
        const calls = parts.filter((p) => p.functionCall).map((p, i) => ({
          id: p.functionCall!.id ?? `call_${turn}_${i}`,
          name: p.functionCall!.name ?? "",
          args: (p.functionCall!.args ?? {}) as Record<string, unknown>,
        }));
        if (!calls.length) {
          if (reason === "MALFORMED_FUNCTION_CALL" && turn < opts.maxTurns) {
            contents.push({ role: "user", parts: [{ text: "That tool call was malformed. Call the tool again with valid JSON arguments, or write your notes." }] });
            continue;
          }
          return { text, turns: turn, stop: "done" };
        }
        // The model's content goes back unchanged: it carries the thought signatures Gemini needs.
        contents.push(content ?? { role: "model", parts });
        const results = await opts.execute(calls);
        contents.push({
          role: "user",
          parts: results.map((r) => ({
            functionResponse: { id: r.id, name: r.name, response: r.isError ? { error: r.output } : { output: r.output } },
          })),
        });
      }
      return { text, turns: opts.maxTurns, stop: "max_turns" };
    },
    async json(opts) {
      const request = (withSchema: boolean) =>
        generateAnyModel({
          contents: [{ role: "user", parts: [{ text: opts.user }] }],
          config: {
            systemInstruction: opts.system,
            responseMimeType: "application/json",
            ...(withSchema ? { responseJsonSchema: opts.schema } : {}),
            thinkingConfig: { thinkingLevel: geminiThinking(ThinkingLevel.MEDIUM) },
            maxOutputTokens: 32000,
            httpOptions: { timeout: 240_000 },
            abortSignal: opts.signal,
          },
        });
      let res;
      try {
        res = await request(true);
      } catch (err) {
        // Gemini rejects some large schemas with 400. The output is validated with Zod afterwards
        // either way, so retry once with the schema only in the prompt.
        if (err instanceof ApiError && err.status === 400 && /schema/i.test(err.message)) res = await request(false);
        else throw err;
      }
      const reason = checkStop(res);
      if (reason === "MAX_TOKENS") throw new ModelStopError("compose_truncated", "The guide was cut off before it finished (output limit reached).");
      return res.text ?? "";
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Anthropic (Claude API). Same tools, executed by this server.

export function anthropicDriver(model: string, client?: Anthropic): LLM {
  const ai = client ?? new Anthropic({ maxRetries: 2 });
  const effort = (env("ANTHROPIC_EFFORT") || "medium") as "low" | "medium" | "high";
  const fallbacks = env("ANTHROPIC_FALLBACKS").toLowerCase() === "off" ? {} : { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const };

  return {
    provider: "anthropic",
    model,
    async toolLoop(opts) {
      const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: opts.user }];
      const tools: Anthropic.Beta.BetaToolUnion[] = opts.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters as Anthropic.Beta.BetaTool.InputSchema,
      }));
      let text = "";
      for (let turn = 1; turn <= opts.maxTurns; turn++) {
        const message = await ai.beta.messages
          .stream({ model, max_tokens: 16000, output_config: { effort }, ...fallbacks, system: opts.system, tools, messages }, { signal: opts.signal })
          .finalMessage();
        if (message.stop_reason === "refusal") throw new ModelStopError("model_refusal", "The model declined this request.");
        const turnText = message.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text").map((b) => b.text).join("").trim();
        if (turnText) text = turnText;
        const calls = message.content
          .filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use")
          .map((b) => ({ id: b.id, name: b.name, args: (b.input ?? {}) as Record<string, unknown> }));
        if (message.stop_reason !== "tool_use" || !calls.length) return { text, turns: turn, stop: "done" };
        messages.push({ role: "assistant", content: message.content });
        const results = await opts.execute(calls);
        messages.push({
          role: "user",
          content: results.map((r) => ({ type: "tool_result" as const, tool_use_id: r.id, content: r.output, is_error: r.isError || undefined })),
        });
      }
      return { text, turns: opts.maxTurns, stop: "max_turns" };
    },
    async json(opts) {
      const message = await ai.beta.messages
        .stream(
          {
            model,
            max_tokens: 32000,
            ...fallbacks,
            output_config: { effort, format: { type: "json_schema", schema: opts.schema } },
            system: opts.system,
            messages: [{ role: "user", content: opts.user }],
          },
          { signal: opts.signal },
        )
        .finalMessage();
      if (message.stop_reason === "refusal") throw new ModelStopError("model_refusal", "The model declined to write the guide.");
      if (message.stop_reason === "max_tokens") throw new ModelStopError("compose_truncated", "The guide was cut off before it finished (output limit reached).");
      return message.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text").map((b) => b.text).join("");
    },
  };
}

// ---------------------------------------------------------------------------------------------

/** Turns SDK errors from either provider into a short message for the UI. */
export function describeModelError(err: unknown): { code: string; message: string } | null {
  if (err instanceof ModelStopError) return { code: err.code, message: err.message };
  const status =
    err instanceof ApiError ? err.status : err instanceof Anthropic.APIError ? (err.status ?? undefined) : undefined;
  if (err instanceof Anthropic.APIConnectionError) return { code: "model_network", message: "Could not reach the model API from the server." };
  if (err instanceof Error && !(err instanceof ApiError) && /fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|socket hang up/i.test(err.message))
    return { code: "model_network", message: "The connection to the model API dropped. Try again." };
  if (status === undefined) return null;
  const detail = err instanceof Error ? err.message.replace(/\s+/g, " ").slice(0, 240) : "";
  if (status === 401 || (status === 400 && /api key/i.test(detail)))
    return { code: "model_auth", message: "The model API rejected the server's API key. Check the key in .env.local." };
  if (status === 403) return { code: "model_permission", message: "The server's API key is not allowed to use this model." };
  if (status === 404) return { code: "model_not_found", message: `The model "${modelName()}" was not found for this key. Set GEMINI_MODEL or ANTHROPIC_MODEL to a model your key can use.` };
  if (status === 429)
    return { code: "model_rate_limit", message: "The model API's rate limit or daily quota was reached. On a free key this resets at midnight Pacific time; try again later." };
  if (status >= 500) return { code: "model_unavailable", message: `The model API is temporarily unavailable (HTTP ${status}). Try again shortly.` };
  return { code: "model_error", message: `The model API returned an error (HTTP ${status}): ${detail}` };
}
