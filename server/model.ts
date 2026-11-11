import Anthropic from "@anthropic-ai/sdk";

export const DEFAULT_MODEL = "claude-opus-5-5";

export function modelName(): string {
  return process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL;
}

export function hasModelCredentials(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim() || process.env.ANTHROPIC_AUTH_TOKEN?.trim());
}

let client: Anthropic | null = null;
export function getClient(): Anthropic {
  // Reads ANTHROPIC_API_KEY from the server environment. The key never reaches the browser.
  client ??= new Anthropic({ maxRetries: 2 });
  return client;
}

/**
 * Shared request parameters. Server-side refusal fallback is on by default (a declined request is
 * re-run on a fallback model inside the same call); set ANTHROPIC_FALLBACKS=off to disable it.
 */
export function modelParams(model: string) {
  const effort = (process.env.ANTHROPIC_EFFORT?.trim() || "medium") as "low" | "medium" | "high";
  const base = { model, output_config: { effort } };
  if (process.env.ANTHROPIC_FALLBACKS?.trim().toLowerCase() === "off") return base;
  return { ...base, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const };
}
