/**
 * One tiny request to the configured model, to confirm the key works before a full investigation.
 *   npm run check-model
 */
import { config } from "dotenv";
config({ path: ".env.local", override: true, quiet: true });
config({ quiet: true });
const { getLLM, describeModelError, hasModelCredentials } = await import("../server/llm.ts");

if (!hasModelCredentials()) {
  console.error("No GEMINI_API_KEY or ANTHROPIC_API_KEY in .env.local");
  process.exit(1);
}
try {
  const llm = getLLM();
  const t = Date.now();
  const out = await llm.json({
    system: "Reply with JSON only.",
    user: 'Return {"ok": true}',
    schema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"], additionalProperties: false },
  });
  console.log(`${llm.provider} ${llm.model} answered in ${Date.now() - t} ms: ${out.trim()}`);
} catch (err) {
  const d = describeModelError(err);
  console.error(d ? `${d.code}: ${d.message}` : String(err).slice(0, 400));
  process.exit(1);
}
