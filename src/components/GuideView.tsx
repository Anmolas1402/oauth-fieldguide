import { useEffect, useMemo, useState } from "react";
import {
  ACTOR_LABEL,
  DIFFICULTY_LABEL,
  REVIEW_LABEL,
  formatDate,
  guideKey,
  ownership,
} from "../../shared/derive.ts";
import { guideToChecklist, guideToMarkdown } from "../../shared/markdown.ts";
import { eachClaim, type Guide } from "../../shared/schema.ts";
import { ActorBadge, ActorGlyph, Button, ClaimLine, Section, SourceRefs, StatusChip, hostOf } from "./bits.tsx";

const NAV = [
  ["snapshot", "Decision snapshot"],
  ["before", "Before you begin"],
  ["steps", "Setup steps"],
  ["division", "Agent vs. human"],
  ["approval", "Approval and risks"],
  ["sources", "Sources and confidence"],
  ["handoff", "Developer handoff"],
] as const;

function useChecked(key: string) {
  const storageKey = `fieldguide:done:${key}`;
  const [done, setDone] = useState<Set<number>>(() => {
    try {
      return new Set<number>(JSON.parse(localStorage.getItem(storageKey) ?? "[]"));
    } catch {
      return new Set<number>();
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify([...done]));
    } catch {
      /* storage unavailable: checks last for this page view only */
    }
  }, [done, storageKey]);
  const toggle = (i: number) =>
    setDone((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  return { done, toggle, reset: () => setDone(new Set()) };
}

function Cell({ label, children, note }: { label: string; children: React.ReactNode; note?: string }) {
  return (
    <div className="bg-surface p-4">
      <p className="text-sm text-muted">{label}</p>
      <div className="mt-1">{children}</div>
      {note && <p className="mt-1.5 text-xs text-muted">{note}</p>}
    </div>
  );
}

export function GuideView({
  guide: g,
  liveAvailable,
  onRerun,
  onPick,
  onHome,
}: {
  guide: Guide;
  liveAvailable: boolean;
  onRerun: () => void;
  onPick: (slug: string) => void;
  onHome: () => void;
}) {
  const key = guideKey(g);
  const { done, toggle, reset } = useChecked(key);
  const [copied, setCopied] = useState<string | null>(null);
  const own = ownership(g.composio);
  const counts = g.validation.counts;
  const total = counts.verified + counts.inferred + counts.unknown;

  const supports = useMemo(() => {
    const map = new Map<string, string[]>();
    eachClaim(g, (c) => {
      for (const id of c.sourceIds) map.set(id, [...(map.get(id) ?? []), c.text]);
    });
    for (const e of g.scopes.examples) for (const id of e.sourceIds) map.set(id, [...(map.get(id) ?? []), `Scope ${e.scope}`]);
    return map;
  }, [g]);

  const flash = (what: string) => {
    setCopied(what);
    setTimeout(() => setCopied(null), 2200);
  };
  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      flash(what);
    } catch {
      flash("Copy was blocked by the browser");
    }
  };
  const download = () => {
    const blob = new Blob([guideToMarkdown(g, done)], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${key}-oauth-setup.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    flash("Markdown downloaded");
  };

  if (g.providerStatus === "not_identified") {
    return (
      <div className="mx-auto max-w-2xl pt-12">
        <p className="text-sm text-muted">Investigation</p>
        <h1 className="text-2xl font-semibold tracking-tight">{g.meta.query}</h1>
        <div className="mt-6 rounded-md border border-line bg-surface p-5">
          <p className="font-medium">This provider could not be identified</p>
          <p className="mt-1.5 text-ink-2">{g.provider.description}</p>
          <p className="mt-3 text-sm text-muted">
            The investigation ran {g.log.searches.length} searches and read {g.sources.filter((s) => s.kind === "provider_page").length} provider
            pages. No guide was written, because writing one would mean inventing it.
          </p>
          {g.log.searches.length > 0 && (
            <ul className="mt-3 list-disc pl-5 text-sm text-ink-2">
              {g.log.searches.map((s, i) => (
                <li key={i}>Searched “{s.query}” ({s.results.length} results)</li>
              ))}
            </ul>
          )}
        </div>
        <div className="mt-4">
          <Button onClick={onHome}>Back to search</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="pt-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 max-w-3xl">
          <p className="text-sm text-muted">OAuth app setup guide</p>
          <h1 className="text-[1.75rem] font-semibold leading-tight tracking-tight">{g.provider.name}</h1>
          <p className="mt-1.5 text-ink-2">{g.provider.description}</p>
        </div>
        <div className="no-print flex flex-wrap gap-2">
          <Button onClick={download}>Export Markdown</Button>
          <Button onClick={() => copy(guideToChecklist(g, done), "Checklist copied")}>Copy checklist</Button>
          <Button variant="primary" onClick={onRerun} disabled={!liveAvailable} title={liveAvailable ? "Run the full investigation again now" : "The server has no model API key"}>
            Re-run live
          </Button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
        <span>
          {g.meta.origin === "saved" ? "Saved investigation from" : "Investigated"} {formatDate(g.meta.investigatedAt)}
        </span>
        <span>{g.sources.length} sources</span>
        <span>{Math.round(g.meta.durationMs / 1000)}s of research</span>
        <span className="font-mono text-xs">{g.meta.model}</span>
        <span role="status" className="text-accent">{copied}</span>
      </div>

      {g.meta.origin === "saved" && (
        <p className="mt-4 rounded-md border border-line bg-sunken px-4 py-2.5 text-sm text-ink-2">
          You are reading a stored result of the same pipeline, not a fresh run. Provider policies change: re-run it live before relying on it.
        </p>
      )}
      {(g.provider.assumption || g.composio.matchNote) && (
        <div className="mt-3 rounded-md border border-warn/30 bg-warn-soft px-4 py-2.5 text-sm text-warn">
          <span className="font-medium">Assumption. </span>
          {[g.composio.matchNote, g.provider.assumption].filter(Boolean).join(" ")}
          {g.composio.alternatives.length > 0 && (
            <span className="no-print mt-1.5 flex flex-wrap items-center gap-1.5">
              <span>Investigate instead:</span>
              {g.composio.alternatives.map((a) => (
                <button key={a.slug} onClick={() => onPick(a.slug.toLowerCase())} className="rounded border border-warn/40 px-2 py-0.5 hover:bg-surface">
                  {a.name}
                </button>
              ))}
            </span>
          )}
        </div>
      )}

      <div className="mt-8 grid gap-10 lg:grid-cols-[13rem_minmax(0,1fr)]">
        <nav className="no-print hidden lg:block" aria-label="Guide sections">
          <ol className="sticky top-20 space-y-0.5 text-sm">
            {NAV.map(([id, label], i) => (
              <li key={id}>
                <a href={`#${id}`} onClick={(e) => { e.preventDefault(); document.getElementById(id)?.scrollIntoView(); }} className="flex gap-2 rounded px-2 py-1.5 text-ink-2 hover:bg-sunken hover:text-ink">
                  <span className="font-mono text-xs leading-5 text-muted">{i + 1}</span>
                  {label}
                </a>
              </li>
            ))}
            <li className="mt-4 border-t border-line px-2 pt-4 text-muted">
              <p className="text-xs">Evidence in this guide</p>
              <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-idle-soft">
                <span className="bg-ok" style={{ width: `${(counts.verified / Math.max(1, total)) * 100}%` }} />
                <span className="bg-warn" style={{ width: `${(counts.inferred / Math.max(1, total)) * 100}%` }} />
              </div>
              <p className="mt-2 text-xs leading-5">
                {counts.verified} verified
                <br />
                {counts.inferred} inferred
                <br />
                {counts.unknown} unknown
              </p>
            </li>
          </ol>
        </nav>

        <div className="min-w-0 space-y-10">
          {/* 1 */}
          <section id="snapshot">
            <h2 className="mb-4 text-lg font-semibold tracking-tight">
              <span className="mr-2 font-mono text-sm font-normal text-muted">1</span>Decision snapshot
            </h2>
            <div className="grid gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-2">
              <Cell label="Composio-managed OAuth app" note="From Composio's live toolkit data, not from the model.">
                <p className="text-base font-semibold">{own.managed}</p>
              </Cell>
              <Cell label="Registering your own OAuth app">
                <p className="text-base font-semibold">{own.custom}</p>
              </Cell>
              <div className="bg-surface p-4 sm:col-span-2">
                <p className="text-sm text-ink-2">{own.detail}</p>
              </div>
              <Cell label="What you register">
                <p className="font-medium">{g.oauthAppKind}</p>
              </Cell>
              <Cell label="Authentication method">
                <ClaimLine claim={g.authMethod} sources={g.sources} />
              </Cell>
              <Cell label="Setup difficulty">
                <p className="font-semibold">{DIFFICULTY_LABEL[g.difficulty.level]}</p>
                <p className="mt-1 text-sm text-ink-2">{g.difficulty.rationale}</p>
              </Cell>
              <Cell label="Your hands-on effort" note="An estimate made by this tool. It excludes any wait for provider review.">
                <p className="font-semibold">{g.handsOnEffort.estimate}</p>
                <p className="mt-1 text-sm text-ink-2">{g.handsOnEffort.basis}</p>
              </Cell>
              <Cell label="Provider review of your app">
                <p className="mb-1 font-semibold">{REVIEW_LABEL[g.externalReview.requirement]}</p>
                <ClaimLine claim={g.externalReview.summary} sources={g.sources} />
              </Cell>
              <Cell label="Review timeline published by the provider" note="Only a duration quoted from a retrieved page is shown here.">
                <ClaimLine claim={g.externalReview.publishedTimeline} sources={g.sources} />
              </Cell>
            </div>
            <p className="mt-3 text-sm text-muted lg:hidden">
              Evidence in this guide: {counts.verified} verified, {counts.inferred} inferred, {counts.unknown} unknown.
            </p>
            {g.composio.faq.length > 0 && (
              <details className="mt-4 rounded-md border border-line bg-surface">
                <summary className="px-4 py-3 text-sm font-medium hover:bg-sunken">
                  What Composio's toolkit page says about connecting {g.composio.name} ({g.composio.faq.length} notes)
                </summary>
                <dl className="space-y-3 border-t border-line px-4 py-3 text-sm">
                  {g.composio.faq.map((f) => (
                    <div key={f.question}>
                      <dt className="font-medium">{f.question}</dt>
                      <dd className="mt-0.5 whitespace-pre-line text-ink-2">{f.answer.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/\*\*/g, "")}</dd>
                    </div>
                  ))}
                </dl>
              </details>
            )}
          </section>

          {/* 2 */}
          <Section id="before" n={2} title="Before you begin">
            <div className="rounded-md border border-line bg-surface p-4">
              <p className="text-sm text-muted">Provider developer console</p>
              <p className="mt-0.5 font-medium">
                {g.console.url ? (
                  <a href={g.console.url} target="_blank" rel="noreferrer" className="underline decoration-line-strong hover:text-accent">
                    {g.console.name}
                  </a>
                ) : (
                  g.console.name
                )}
                {g.console.url && <span className="ml-2 font-mono text-xs font-normal text-muted">{hostOf(g.console.url)}</span>}
              </p>
              {g.console.url && !g.console.urlSeenInSources && (
                <p className="mt-1 text-xs text-warn">This console link did not appear in the retrieved pages. Check it before use.</p>
              )}
            </div>
            <ul className="mt-4 divide-y divide-line">
              {g.prerequisites.map((p, i) => (
                <li key={i} className="flex gap-3 py-3">
                  <span className="mt-0.5 w-20 shrink-0 text-sm capitalize text-muted">{p.kind}</span>
                  <ClaimLine claim={p} sources={g.sources} />
                </li>
              ))}
              {g.prerequisites.length === 0 && <li className="py-3 text-sm text-muted">No prerequisites were established.</li>}
            </ul>
          </Section>

          {/* 3 */}
          <Section id="steps" n={3} title="Setup steps" hint={`${done.size} of ${g.steps.length} marked done`}>
            <ol className="space-y-3">
              {g.steps.map((s, i) => {
                const isDone = done.has(i);
                return (
                  <li key={i} className={`rounded-md border bg-surface p-4 ${isDone ? "border-line opacity-70" : "border-line"}`}>
                    <div className="flex gap-3">
                      <input
                        type="checkbox"
                        checked={isDone}
                        onChange={() => toggle(i)}
                        aria-label={`Mark step ${i + 1} done: ${s.title}`}
                        className="mt-1 h-4 w-4 shrink-0 accent-[var(--accent)]"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
                          <h3 className={`font-medium ${isDone ? "line-through decoration-muted" : ""}`}>
                            <span className="mr-1.5 font-mono text-sm text-muted">{i + 1}.</span>
                            {s.title}
                          </h3>
                          <ActorBadge actor={s.actor} />
                        </div>
                        <p className="mt-1.5 text-ink-2">{s.action}</p>
                        <dl className="mt-3 grid gap-x-3 gap-y-1.5 text-sm sm:grid-cols-[4.5rem_1fr]">
                          <dt className="text-muted">Where</dt>
                          <dd className="min-w-0">
                            {s.where}
                            {s.link && (
                              <>
                                {" "}
                                <a href={s.link} target="_blank" rel="noreferrer" className="break-all font-mono text-xs text-accent underline decoration-accent/40">
                                  {s.link.replace(/^https:\/\//, "")}
                                </a>
                                {!s.linkSeenInSources && <span className="ml-1.5 text-xs text-warn">link not seen in retrieved pages</span>}
                              </>
                            )}
                          </dd>
                          <dt className="text-muted">Who</dt>
                          <dd>{s.actorReason}</dd>
                          <dt className="text-muted">Evidence</dt>
                          <dd className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <StatusChip status={s.status} />
                            <SourceRefs ids={s.sourceIds} sources={g.sources} />
                            {s.quote && <span className="basis-full border-l-2 border-line-strong pl-3 text-ink-2">“{s.quote}”</span>}
                          </dd>
                        </dl>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
            {g.steps.length > 0 && done.size > 0 && (
              <button onClick={reset} className="no-print mt-2 text-sm text-muted underline decoration-line-strong hover:text-ink">
                Clear checkmarks
              </button>
            )}

            <div className="mt-8 grid gap-8 md:grid-cols-2">
              <div>
                <h3 className="font-semibold">Redirect URI rules</h3>
                <ul className="mt-2 divide-y divide-line">
                  {g.redirectRules.map((c, i) => (
                    <li key={i} className="py-3"><ClaimLine claim={c} sources={g.sources} /></li>
                  ))}
                  {g.redirectRules.length === 0 && <li className="py-3 text-sm text-muted">No redirect rules were established.</li>}
                </ul>
              </div>
              <div>
                <h3 className="font-semibold">Scopes</h3>
                <div className="mt-2 py-3"><ClaimLine claim={g.scopes.model} sources={g.sources} /></div>
                {g.scopes.examples.length > 0 && (
                  <ul className="divide-y divide-line border-t border-line text-sm">
                    {g.scopes.examples.map((e) => (
                      <li key={e.scope} className="py-2.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <code className="break-all rounded bg-sunken px-1.5 py-0.5 font-mono text-[12.5px]">{e.scope}</code>
                          {e.tier && <span className="rounded border border-line px-1.5 text-xs text-ink-2">{e.tier}</span>}
                          <SourceRefs ids={e.sourceIds} sources={g.sources} />
                          {!e.seenInSource && <span className="text-xs text-warn">not found verbatim in a retrieved page</span>}
                        </div>
                        <p className="mt-1 text-ink-2">{e.grants}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </Section>

          {/* 4 */}
          <Section id="division" n={4} title="Agent vs. human" hint="This tool investigates and prepares. It does not act inside provider consoles.">
            <div className="grid gap-4 md:grid-cols-3">
              {(
                [
                  ["agent_prepares", "An agent can investigate or prepare", g.division.agentPrepares],
                  ["agent_assists", "An agent can assist, you authorize", g.division.agentAssists],
                  ["human_only", "Only you can do", g.division.humanOnly],
                ] as const
              ).map(([actor, title, items]) => (
                <div key={actor} className="rounded-md border border-line bg-surface p-4">
                  <h3 className="flex items-center gap-2 text-sm font-semibold">
                    <ActorGlyph actor={actor} />
                    {title}
                  </h3>
                  <ul className="mt-3 space-y-2 text-sm text-ink-2">
                    {items.map((t, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-muted" />
                        {t}
                      </li>
                    ))}
                    {items.length === 0 && <li className="text-muted">Nothing in this group.</li>}
                  </ul>
                </div>
              ))}
            </div>
            <p className="mt-3 text-sm text-muted">
              Steps by owner: {(["agent_prepares", "agent_assists", "human_only"] as const).map((a) => `${g.steps.filter((s) => s.actor === a).length} ${ACTOR_LABEL[a].toLowerCase()}`).join(", ")}.
            </p>
          </Section>

          {/* 5 */}
          <Section id="approval" n={5} title="Approval and risks">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-md border border-line bg-surface p-4">
                <p className="text-sm text-muted">Your effort</p>
                <p className="mt-0.5 text-base font-semibold">{g.handsOnEffort.estimate}</p>
                <p className="mt-1 text-sm text-ink-2">{g.handsOnEffort.basis}</p>
                <p className="mt-2 text-xs text-muted">Estimate by this tool, within your control.</p>
              </div>
              <div className="rounded-md border border-line bg-surface p-4">
                <p className="text-sm text-muted">External review time</p>
                <p className="mt-0.5 text-base font-semibold">{REVIEW_LABEL[g.externalReview.requirement]}</p>
                <div className="mt-1 text-sm"><ClaimLine claim={g.externalReview.publishedTimeline} sources={g.sources} /></div>
                <p className="mt-2 text-xs text-muted">Outside your control. Approval is never guaranteed.</p>
              </div>
            </div>
            <p className="mt-3 text-sm text-muted">
              Provider review of your app is a different thing from an end user's consent. Each user still approves access for their own account whether or not your app is reviewed.
            </p>

            {g.externalReview.triggers.length > 0 && (
              <>
                <h3 className="mt-6 font-semibold">What triggers review</h3>
                <ul className="mt-1 divide-y divide-line">
                  {g.externalReview.triggers.map((c, i) => (
                    <li key={i} className="py-3"><ClaimLine claim={c} sources={g.sources} /></li>
                  ))}
                </ul>
              </>
            )}

            <h3 className="mt-6 font-semibold">Risks and blockers</h3>
            <ul className="mt-1 divide-y divide-line">
              {g.risks.map((r, i) => (
                <li key={i} className="flex gap-3 py-3">
                  <span className="mt-0.5 w-20 shrink-0 text-sm capitalize text-muted">{r.kind}</span>
                  <ClaimLine claim={r} sources={g.sources} />
                </li>
              ))}
              {g.risks.length === 0 && <li className="py-3 text-sm text-muted">No risks were established.</li>}
            </ul>
          </Section>

          {/* 6 */}
          <Section id="sources" n={6} title="Sources and confidence" hint={`Last investigated ${formatDate(g.meta.investigatedAt)}`}>
            <div className="overflow-x-auto rounded-md border border-line">
              <table className="w-full min-w-[34rem] text-left text-sm">
                <thead className="bg-sunken text-muted">
                  <tr>
                    <th className="px-3 py-2 font-medium">Id</th>
                    <th className="px-3 py-2 font-medium">Page retrieved</th>
                    <th className="px-3 py-2 font-medium">Type</th>
                    <th className="px-3 py-2 font-medium">Supports</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line bg-surface">
                  {g.sources.map((s) => {
                    const claims = supports.get(s.id) ?? [];
                    return (
                      <tr key={s.id} className="align-top">
                        <td className="px-3 py-2.5 font-mono text-xs">{s.id}</td>
                        <td className="px-3 py-2.5">
                          <a href={s.url} target="_blank" rel="noreferrer" className="font-medium underline decoration-line-strong hover:text-accent">
                            {s.title}
                          </a>
                          <p className="break-all font-mono text-xs text-muted">{s.url.replace(/^https:\/\//, "")}</p>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-ink-2">{s.kind === "composio" ? "Composio docs" : "Provider or web page"}</td>
                        <td className="px-3 py-2.5">
                          {claims.length ? (
                            <details>
                              <summary className="text-ink-2 underline decoration-line-strong hover:text-ink">{claims.length} claim{claims.length === 1 ? "" : "s"}</summary>
                              <ul className="mt-1.5 list-disc space-y-1 pl-4 text-ink-2">
                                {claims.map((c, i) => (
                                  <li key={i}>{c}</li>
                                ))}
                              </ul>
                            </details>
                          ) : (
                            <span className="text-muted">Read, not cited</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-6 grid gap-8 md:grid-cols-2">
              <div>
                <h3 className="font-semibold">Unresolved questions</h3>
                <ul className="mt-2 space-y-2 text-sm text-ink-2">
                  {g.unresolved.map((u, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-muted" />
                      {u}
                    </li>
                  ))}
                  {g.unresolved.length === 0 && <li className="text-muted">None recorded.</li>}
                </ul>
              </div>
              <div>
                <h3 className="font-semibold">Validator adjustments</h3>
                <p className="mt-1 text-sm text-muted">Changes the automatic cross-check made to the model's draft.</p>
                <ul className="mt-2 space-y-2 text-sm">
                  {g.validation.adjustments.map((a, i) => (
                    <li key={i}>
                      <span className="font-medium">{a.change}</span> <span className="font-mono text-xs text-muted">{a.path}</span>
                      <p className="text-ink-2">{a.reason}</p>
                    </li>
                  ))}
                  {g.validation.adjustments.length === 0 && <li className="text-muted">None. Every verified claim's quote was found in its cited page.</li>}
                </ul>
              </div>
            </div>

            <details className="mt-6 rounded-md border border-line bg-surface">
              <summary className="px-4 py-3 text-sm font-medium hover:bg-sunken">
                Investigation log: {g.log.searches.length} searches, {g.log.fetches.filter((f) => f.ok).length} pages read, {g.log.fetches.filter((f) => !f.ok).length} failed
              </summary>
              <div className="space-y-4 border-t border-line px-4 py-3 text-sm">
                <div>
                  <p className="font-medium">Searches</p>
                  <ul className="mt-1 space-y-1 text-ink-2">
                    {g.log.searches.map((s, i) => (
                      <li key={i}>“{s.query}” <span className="text-muted">· {s.results.length} results</span></li>
                    ))}
                    {g.log.searches.length === 0 && <li className="text-muted">None.</li>}
                  </ul>
                </div>
                <div>
                  <p className="font-medium">Page retrievals</p>
                  <ul className="mt-1 space-y-1">
                    {g.log.fetches.map((f, i) => (
                      <li key={i} className={f.ok ? "text-ink-2" : "text-bad"}>
                        <span className="break-all font-mono text-xs">{f.url.replace(/^https:\/\//, "")}</span>{" "}
                        <span className={f.ok ? "text-muted" : ""}>· {f.ok ? `${f.sourceId}, ${f.detail}` : `not retrieved: ${f.detail}`}</span>
                      </li>
                    ))}
                    {g.log.fetches.length === 0 && <li className="text-muted">None.</li>}
                  </ul>
                </div>
              </div>
            </details>
          </Section>

          {/* 7 */}
          <Section id="handoff" n={7} title="Developer handoff">
            <h3 className="font-semibold">Next actions</h3>
            <ol className="mt-2 space-y-2">
              {g.nextActions.map((a, i) => (
                <li key={i} className="flex gap-3">
                  <span className="font-mono text-sm text-muted">{i + 1}.</span>
                  <span>{a}</span>
                </li>
              ))}
            </ol>
            <div className="mt-6 rounded-md border border-line bg-surface">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
                <p className="text-sm font-medium">Checklist</p>
                <div className="no-print flex gap-2">
                  <Button onClick={() => copy(guideToChecklist(g, done), "Checklist copied")}>Copy checklist</Button>
                  <Button onClick={() => copy(guideToMarkdown(g, done), "Markdown copied")}>Copy Markdown</Button>
                  <Button onClick={download}>Download .md</Button>
                </div>
              </div>
              <pre className="overflow-x-auto whitespace-pre-wrap px-4 py-3 font-mono text-[12.5px] leading-6 text-ink-2">{guideToChecklist(g, done)}</pre>
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}
