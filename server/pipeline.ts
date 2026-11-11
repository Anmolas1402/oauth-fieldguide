import type { ComposioFacts, Guide, NoOAuthResult, PipelineEvent, Source, StageId } from "../shared/schema.ts";
import { GuideSchema } from "../shared/schema.ts";
import { investigationGaps } from "../shared/derive.ts";
import {
  CATALOGUE_URL,
  MANAGED_VS_CUSTOM_URL,
  customGuideUrl,
  fetchCatalogue,
  fetchToolkitHead,
  relevantFaq,
  type CatalogueEntry,
  type ToolkitHead,
} from "./composio.ts";
import { composeGuide } from "./compose.ts";
import { describeModelError, getLLM, hasModelCredentials } from "./llm.ts";
import { PipelineError, runResearch, type LedgerSource, type ResearchResult } from "./research.ts";
import { clearResearchCache, readResearchCache, writeResearchCache } from "./researchCache.ts";
import { resolveProvider } from "./resolve.ts";
import { verifyDraft } from "./verify.ts";
import { classifySource } from "./authority.ts";

export type PipelineOutcome =
  | { kind: "guide"; guide: Guide }
  | { kind: "no_oauth"; result: NoOAuthResult }
  | { kind: "error" };

export const toPublicSource = (s: LedgerSource, providerName = "", slug: string | null = null): Source => ({
  id: s.id,
  url: s.url,
  title: s.title,
  kind: s.kind,
  authority: s.kind === "composio" ? "composio" : classifySource(s.url, providerName, slug),
  retrievedAt: s.retrievedAt,
  chars: s.chars,
  truncated: s.truncated,
});

export async function investigate(
  rawQuery: string,
  send: (event: PipelineEvent) => void,
  signal?: AbortSignal,
  opts: { fresh?: boolean } = {},
): Promise<PipelineOutcome> {
  const started = Date.now();
  const query = rawQuery.trim().slice(0, 80);
  let stage: StageId = "resolve";
  const begin = (id: StageId) => {
    stage = id;
    send({ type: "stage", id, state: "running" });
  };
  const done = (id: StageId, detail?: string) => send({ type: "stage", id, state: "done", detail });

  try {
    // 1. Identify the provider against Composio's live catalogue.
    begin("resolve");
    send({ type: "activity", stage: "resolve", activity: { id: "catalogue", kind: "composio", label: "Composio managed-auth catalogue", url: CATALOGUE_URL.replace(/\.md$/, ""), state: "running" } });
    const catalogue = await fetchCatalogue();
    send({ type: "activity", stage: "resolve", activity: { id: "catalogue", kind: "composio", label: "Composio managed-auth catalogue", url: CATALOGUE_URL.replace(/\.md$/, ""), state: "done", detail: `${catalogue.entries.length} OAuth toolkits listed` } });
    const resolution = resolveProvider(query, catalogue.entries);

    let entry: CatalogueEntry | null = resolution.match;
    let head: ToolkitHead | null = null;
    if (!entry) {
      // Not in the OAuth catalogue: it may still be a Composio toolkit that uses API keys.
      for (const guess of resolution.slugGuesses) {
        head = await fetchToolkitHead(guess).catch(() => null);
        if (head) break;
      }
    }
    const providerName = entry?.name ?? head?.name ?? resolution.displayName;
    done(
      "resolve",
      entry
        ? `${resolution.confidence === "exact" ? "Matched" : "Assumed"} Composio toolkit ${entry.name} (${entry.slug})`
        : head
          ? `Found Composio toolkit ${head.name}; it is not in the OAuth catalogue`
          : `"${query}" is not a Composio toolkit name; researching it as a provider anyway`,
    );

    // 2. Managed vs bring-your-own, from the toolkit page.
    begin("composio");
    if (entry) {
      const url = `https://docs.composio.dev/toolkits/${entry.pageSlug}`;
      send({ type: "activity", stage: "composio", activity: { id: "toolkit", kind: "composio", label: `Composio toolkit page: ${entry.name}`, url, state: "running" } });
      head = await fetchToolkitHead(entry.pageSlug);
      send({ type: "activity", stage: "composio", activity: { id: "toolkit", kind: "composio", label: `Composio toolkit page: ${entry.name}`, url, state: head ? "done" : "failed", detail: head ? `auth: ${head.authSchemes.join(", ") || "not stated"}` : "page not found" } });
    }
    const ledger: LedgerSource[] = [];
    const now = () => new Date().toISOString();
    if (head) {
      ledger.push({ id: "S1", url: head.url, title: `${head.name} toolkit (Composio docs)`, kind: "composio", retrievedAt: now(), chars: head.text.length, truncated: false, text: head.text.slice(0, 20000) });
    }
    const catalogueList = entry?.list ?? "absent";
    ledger.push({
      id: `S${ledger.length + 1}`,
      url: CATALOGUE_URL.replace(/\.md$/, ""),
      title: "Managed OAuth apps catalogue (Composio docs)",
      kind: "composio",
      retrievedAt: catalogue.fetchedAt,
      chars: 0,
      truncated: true,
      // Only the framing text and this provider's row are kept as quotable evidence.
      text: catalogue.raw.split("\n## ")[0] + (entry ? `\n\n${entry.list === "managed" ? "## Composio-managed OAuth available" : "## Bring your own OAuth app"}\n| ${entry.name} | \`${entry.slug}\` |` : ""),
    });
    ledger[ledger.length - 1].chars = ledger[ledger.length - 1].text.length;
    const guideDoc = await fetch(MANAGED_VS_CUSTOM_URL, { signal: AbortSignal.timeout(12000) })
      .then((r) => (r.ok ? r.text() : null))
      .catch(() => null);
    if (guideDoc) {
      const text = guideDoc.replace(/^---[\s\S]*?---\s*/, "").split("\n## Mixing per toolkit")[0].replace(/\*\*(Python|TypeScript|API):\*\*\n```[\s\S]*?```/g, "").trim();
      ledger.push({ id: `S${ledger.length + 1}`, url: MANAGED_VS_CUSTOM_URL.replace(/\.md$/, ""), title: "Managed vs custom auth (Composio docs)", kind: "composio", retrievedAt: now(), chars: text.length, truncated: false, text });
    }

    const facts: ComposioFacts = {
      listed: Boolean(head),
      name: head?.name ?? entry?.name ?? null,
      slug: head?.slug ?? entry?.slug ?? null,
      category: head?.category ?? null,
      authSchemes: head?.authSchemes ?? [],
      // The toolkit page is the per-toolkit statement; the catalogue list is the fallback.
      managedOAuth: head?.managedOAuth ?? (entry ? entry.list === "managed" : null),
      catalogueList,
      customGuideUrl: head ? customGuideUrl(head) : null,
      faq: head ? relevantFaq(head.faq) : [],
      matchNote: resolution.note,
      alternatives: resolution.alternatives.map((a) => ({ name: a.name, slug: a.slug })),
    };
    send({ type: "composio", facts });

    const usesOAuth = facts.authSchemes.some((s) => /oauth/i.test(s));
    done(
      "composio",
      !facts.listed
        ? "No Composio toolkit page for this name"
        : facts.managedOAuth === true
          ? "Composio-managed OAuth app is available; bringing your own is optional"
          : facts.managedOAuth === false && usesOAuth
            ? "No Composio-managed OAuth app: you must register your own"
            : `Auth schemes: ${facts.authSchemes.join(", ") || "not stated"}`,
    );

    if (facts.listed && facts.authSchemes.length > 0 && !usesOAuth) {
      for (const id of ["research", "compose", "verify"] as const) send({ type: "stage", id, state: "skipped", detail: "Not an OAuth toolkit" });
      const result: NoOAuthResult = { kind: "no_oauth", query, investigatedAt: now(), composio: facts, sources: ledger.map((s) => toPublicSource(s, facts.name ?? query, facts.slug)) };
      send({ type: "no_oauth", result });
      return { kind: "no_oauth", result };
    }

    // 3. Research. Needs the model; everything above works without it.
    begin("research");
    if (!hasModelCredentials()) {
      throw new PipelineError(
        "no_model_key",
        "This server has no model API key (GEMINI_API_KEY or ANTHROPIC_API_KEY), so the research and guide-writing stages cannot run. The Composio lookup above is real; nothing beyond it was generated.",
      );
    }
    const llm = getLLM();
    const cacheKey = (facts.slug ?? query).toLowerCase();
    const reused = opts.fresh ? null : await readResearchCache(cacheKey);
    let research: ResearchResult;
    if (reused) {
      research = reused.research;
      for (const s of research.ledger.filter((x) => x.kind === "provider_page")) {
        send({ type: "activity", stage: "research", activity: { id: `reuse-${s.id}`, kind: "fetch", label: s.title, url: s.url, state: "done", detail: `${s.id} · retrieved ${s.retrievedAt.slice(11, 16)} UTC` } });
      }
    } else {
      research = await runResearch({
        llm,
        providerName,
        query,
        composio: facts,
        seedSources: ledger,
        signal,
        emit: (activity) => send({ type: "activity", stage: "research", activity }),
      });
      await writeResearchCache(cacheKey, research);
    }
    const pages = research.ledger.filter((s) => s.kind === "provider_page").length;
    const failed = research.log.fetches.filter((f) => !f.ok).length;
    const skipped = llm.skippedModels?.length ? `; used ${llm.model} because ${llm.skippedModels.join(", ")} was unavailable` : "";
    done(
      "research",
      reused
        ? `Reused research from ${Math.round((Date.now() - reused.at) / 60000)} min ago (${pages} pages); guide writing had not finished then`
        : `${research.log.searches.length} searches, ${pages} pages read${failed ? `, ${failed} could not be retrieved` : ""}${skipped}`,
    );

    // 4. Compose the structured guide.
    begin("compose");
    const draft = await composeGuide({ llm, providerName, query, composio: facts, notes: research.notes, ledger: research.ledger, signal });
    const composeSkips = (llm.skippedModels ?? []).filter((x) => x.includes("guide-writing"));
    done("compose", `${draft.steps.length} setup steps drafted on ${llm.model}${composeSkips.length ? `; skipped ${composeSkips.join(", ")}` : ""}`);

    // 5. Cross-check every claim against the retrieved text.
    begin("verify");
    const publicSources = research.ledger.map((s) => toPublicSource(s, providerName, facts.slug));
    const checked = verifyDraft(draft, research.ledger.map((s, i) => ({ ...s, authority: publicSources[i].authority })));
    const guide: Guide = GuideSchema.parse({
      ...checked.draft,
      steps: checked.steps,
      scopes: checked.scopes,
      console: checked.console,
      meta: { query, investigatedAt: now(), model: `${llm.provider}/${llm.model}`, durationMs: Date.now() - started, origin: "live" },
      composio: facts,
      sources: publicSources,
      log: research.log,
      validation: checked.validation,
    });
    const c = guide.validation.counts;
    const gaps = investigationGaps(guide);
    done(
      "verify",
      `${c.verified} verified, ${c.inferred} inferred, ${c.unknown} unknown; ${guide.validation.adjustments.length} adjustments` +
        (gaps.length ? `; incomplete investigation (${gaps.length} gap${gaps.length === 1 ? "" : "s"})` : ""),
    );
    if (llm.calls !== undefined) console.log(`[investigate] ${query}: ${llm.calls} model calls on ${llm.provider}/${llm.model}`);
    await clearResearchCache(cacheKey); // only unfinished research is kept for reuse
    send({ type: "result", guide });
    return { kind: "guide", guide };
  } catch (err) {
    const { code, message } = describeError(err);
    send({ type: "stage", id: stage, state: "failed", detail: message });
    send({ type: "error", code, message, stage });
    return { kind: "error" };
  }
}

export function describeError(err: unknown): { code: string; message: string } {
  if (err instanceof PipelineError) return { code: err.code, message: err.message };
  const model = describeModelError(err);
  if (model) return model;
  if (err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError"))
    return { code: "aborted", message: "The investigation was cancelled or timed out." };
  return { code: "internal", message: err instanceof Error ? err.message.slice(0, 240) : "Unexpected error." };
}
