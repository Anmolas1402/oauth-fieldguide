import { useEffect, useState } from "react";
import { ownership } from "../../shared/derive.ts";
import type { Activity, ComposioFacts, NoOAuthResult } from "../../shared/schema.ts";
import { STAGES } from "../../shared/schema.ts";
import type { RunState, StageState } from "../App.tsx";
import { Button, hostOf } from "./bits.tsx";

function StageIcon({ state }: { state: StageState["state"] }) {
  const base = "flex h-5 w-5 shrink-0 items-center justify-center rounded-full";
  if (state === "running")
    return (
      <span className={base} aria-label="In progress">
        <svg viewBox="0 0 20 20" className="spinner h-5 w-5 text-accent">
          <circle cx="10" cy="10" r="7.5" fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2" />
          <path d="M10 2.5a7.5 7.5 0 0 1 7.5 7.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </span>
    );
  if (state === "done")
    return (
      <span className={`${base} bg-ok text-surface`} aria-label="Done">
        <svg viewBox="0 0 12 12" className="h-3 w-3">
          <path d="M2.5 6.4 5 8.8l4.5-5.3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    );
  if (state === "failed")
    return (
      <span className={`${base} bg-bad text-surface`} aria-label="Failed">
        <svg viewBox="0 0 12 12" className="h-3 w-3">
          <path d="M3.5 3.5l5 5m0-5l-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </span>
    );
  if (state === "skipped")
    return (
      <span className={`${base} border border-line-strong text-muted`} aria-label="Skipped">
        <svg viewBox="0 0 12 12" className="h-3 w-3">
          <path d="M3.5 6h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </span>
    );
  return <span className={`${base} border border-line-strong`} aria-label="Not started" />;
}

function ActivityRow({ a }: { a: Activity }) {
  const verb =
    a.kind === "search"
      ? a.state === "running" ? "Searching" : a.state === "failed" ? "Search failed" : "Searched"
      : a.state === "running" ? "Reading" : a.state === "failed" ? "Could not read" : "Read";
  return (
    <li className="flex gap-2 text-sm">
      <span className={`w-24 shrink-0 ${a.state === "failed" ? "text-bad" : "text-muted"}`}>{verb}</span>
      <span className="min-w-0 flex-1">
        {a.url ? (
          <a href={a.url} target="_blank" rel="noreferrer" className="break-words text-ink-2 underline decoration-line-strong hover:text-ink">
            {a.kind === "fetch" && a.label === a.url ? a.url.replace(/^https:\/\//, "") : a.label}
          </a>
        ) : (
          <span className="break-words text-ink-2">{a.kind === "search" ? `“${a.label}”` : a.label}</span>
        )}
        {a.url && a.label !== a.url && <span className="ml-1.5 text-muted">{hostOf(a.url)}</span>}
        {a.detail && <span className={`ml-1.5 ${a.state === "failed" ? "text-bad" : "text-muted"}`}>· {a.detail}</span>}
      </span>
    </li>
  );
}

export function ComposioCard({ facts, onPick }: { facts: ComposioFacts; onPick?: (slug: string) => void }) {
  const own = ownership(facts);
  return (
    <div className="rounded-md border border-line bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">Composio live metadata</h3>
        {facts.slug && <span className="font-mono text-xs text-muted">{facts.slug}</span>}
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        <div>
          <dt className="text-muted">Managed OAuth app</dt>
          <dd className="font-medium">{own.managed}</dd>
        </div>
        <div>
          <dt className="text-muted">Your own OAuth app</dt>
          <dd className="font-medium">{own.custom}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-muted">Auth schemes</dt>
          <dd className="font-mono text-[13px]">{facts.authSchemes.join(", ") || "not stated"}</dd>
        </div>
      </dl>
      <p className="mt-3 text-sm text-ink-2">{own.detail}</p>
      {facts.matchNote && <p className="mt-3 rounded bg-warn-soft px-3 py-2 text-sm text-warn">{facts.matchNote}</p>}
      {onPick && facts.alternatives.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-sm">
          <span className="text-muted">Investigate instead:</span>
          {facts.alternatives.map((a) => (
            <button key={a.slug} onClick={() => onPick(a.slug.toLowerCase())} className="rounded border border-line px-2 py-0.5 text-ink-2 hover:border-accent hover:text-accent">
              {a.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function RunView({
  run,
  onRetry,
  onHome,
  onPick,
}: {
  run: RunState;
  onRetry: () => void;
  onHome: () => void;
  onPick: (slug: string) => void;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!run.active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [run.active]);
  const elapsed = Math.max(0, Math.round(((run.endedAt ?? now) - run.startedAt) / 1000));
  const display = run.query.replace(/^slug:/, "");

  return (
    <div className="mx-auto max-w-5xl pt-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted">{run.active ? "Investigating" : run.error ? "Investigation stopped" : "Investigation"}</p>
          <h1 className="text-2xl font-semibold tracking-tight">{display}</h1>
        </div>
        <p className="font-mono text-sm tabular-nums text-muted" aria-live="off">
          {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")} elapsed
        </p>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_20rem]">
        <ol className="relative" aria-live="polite">
          {STAGES.map((s, i) => {
            const st = run.stages[s.id];
            return (
              <li key={s.id} className="relative flex gap-3 pb-6 last:pb-0">
                {i < STAGES.length - 1 && <span className="absolute left-[9px] top-6 h-[calc(100%-1.5rem)] w-px bg-line" aria-hidden />}
                <StageIcon state={st.state} />
                <div className="min-w-0 flex-1">
                  <p className={`font-medium ${st.state === "pending" || st.state === "skipped" ? "text-muted" : "text-ink"}`}>{s.label}</p>
                  {st.detail && <p className={`mt-0.5 text-sm ${st.state === "failed" ? "text-bad" : "text-ink-2"}`}>{st.detail}</p>}
                  {st.activities.length > 0 && (
                    <ul className="mt-2 space-y-1.5 border-l border-line pl-3">
                      {st.activities.map((a) => (
                        <ActivityRow key={a.id} a={a} />
                      ))}
                    </ul>
                  )}
                </div>
              </li>
            );
          })}
        </ol>

        <aside className="space-y-4">
          {run.composio ? (
            <ComposioCard facts={run.composio} onPick={run.active ? undefined : onPick} />
          ) : (
            <div className="rounded-md border border-dashed border-line p-4 text-sm text-muted">Composio metadata appears here once the lookup finishes.</div>
          )}
          <p className="text-sm text-muted">
            Each row is a real operation reported by the server as it completes. Nothing here runs on a timer.
          </p>
        </aside>
      </div>

      {run.error && (
        <div role="alert" className="mt-8 rounded-md border border-bad/30 bg-bad-soft p-4">
          <p className="font-medium text-bad">The investigation did not finish</p>
          <p className="mt-1 text-sm text-ink">{run.error.message}</p>
          <p className="mt-1 text-sm text-muted">
            No guide was generated. {run.composio ? "The Composio metadata shown is real and was retrieved before the failure." : ""}
          </p>
          <div className="mt-3 flex gap-2">
            <Button onClick={onRetry}>Try again</Button>
            <Button variant="ghost" onClick={onHome}>Back to search</Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function NoOAuthView({ result, onHome }: { result: NoOAuthResult; onHome: () => void }) {
  const c = result.composio;
  return (
    <div className="mx-auto max-w-2xl pt-12">
      <p className="text-sm text-muted">Investigation</p>
      <h1 className="text-2xl font-semibold tracking-tight">{c.name ?? result.query}</h1>
      <div className="mt-6 rounded-md border border-line bg-surface p-5">
        <p className="font-medium">No OAuth app to set up</p>
        <p className="mt-1.5 text-ink-2">
          Composio lists {c.name} with <span className="font-mono text-[13px]">{c.authSchemes.join(", ")}</span> authentication, not
          OAuth. There is no OAuth app to register, no redirect URI and no provider review of an OAuth app. Your users supply
          their own credentials when they connect.
        </p>
        <p className="mt-3 text-sm text-muted">
          The research and guide stages were skipped on purpose. If the provider also offers OAuth outside Composio, that is not
          covered here.
        </p>
        <ul className="mt-4 space-y-1 text-sm">
          {result.sources.map((s) => (
            <li key={s.id}>
              <a href={s.url} target="_blank" rel="noreferrer" className="underline decoration-line-strong hover:text-accent">
                {s.title}
              </a>
            </li>
          ))}
        </ul>
      </div>
      <div className="mt-4">
        <Button onClick={onHome}>Back to search</Button>
      </div>
    </div>
  );
}
