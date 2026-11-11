/**
 * Quick per-model availability check with a short timeout: which Gemini models answer right now,
 * and why the others don't (quota, overload, timeout). Prints status only, never the key.
 *   npx tsx scripts/probe-models.ts
 */
import { config } from "dotenv";
config({ path: ".env.local", override: true, quiet: true });
const { GoogleGenAI } = await import("@google/genai");
const { GEMINI_FALLBACK_MODELS } = await import("../server/llm.ts");
const key = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
if (!key) throw new Error("no GEMINI_API_KEY in .env.local");
const ai = new GoogleGenAI({ apiKey: key, httpOptions: { timeout: 25_000, retryOptions: { attempts: 1 } } as never });
for (const model of GEMINI_FALLBACK_MODELS) {
  const t = Date.now();
  try {
    await ai.models.generateContent({ model, contents: "Reply with the word ok." });
    console.log(`${model}: ok (${Date.now() - t} ms)`);
  } catch (err) {
    const e = err as { status?: number; message?: string; name?: string };
    const msg = String(e.message ?? err);
    const why = /PerDay|quota/i.test(msg) ? "daily quota exhausted" : /overloaded|UNAVAILABLE|503/i.test(msg) ? "overloaded (503)" : /timed? ?out|abort/i.test(msg) || e.name === "AbortError" ? "timed out" : msg.slice(0, 120);
    console.log(`${model}: ${e.status ?? ""} ${why} (${Date.now() - t} ms)`);
  }
}
