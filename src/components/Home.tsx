import { useState } from "react";
import { formatDate } from "../../shared/derive.ts";
import type { Example, Health } from "../api.ts";
import { ActorBadge, Button, StatusChip } from "./bits.tsx";

export function Home({
  examples,
  health,
  onInvestigate,
}: {
  examples: Example[] | null;
  health: Health | null;
  onInvestigate: (query: string) => void;
}) {
  const [query, setQuery] = useState("");
  const tooShort = query.trim().length < 2;

  return (
    <div className="mx-auto max-w-3xl pt-14 sm:pt-20">
      <h1 className="text-balance text-3xl font-semibold leading-tight tracking-tight sm:text-[2.1rem]">
        Know what it takes to launch an OAuth integration before you start building it.
      </h1>
      <p className="mt-4 max-w-2xl text-[1.02rem] text-ink-2">
        Name a provider. Fieldguide checks whether Composio already manages an OAuth app for it, reads the provider's own
        documentation, and writes a setup guide in which every claim is marked as verified, inferred or unknown.
      </p>

      <form
        className="mt-8"
        onSubmit={(e) => {
          e.preventDefault();
          if (!tooShort) onInvestigate(query);
        }}
      >
        <label htmlFor="q" className="mb-2 block text-sm font-medium text-ink">
          Which integration are you setting up?
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id="q"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="For example Xero, Zoom, HubSpot, DocuSign"
            maxLength={80}
            autoComplete="off"
            spellCheck={false}
            className="h-11 min-w-0 flex-1 rounded-md border border-line-strong bg-surface px-3.5 text-base text-ink placeholder:text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25"
          />
          <button
            type="submit"
            disabled={tooShort}
            className="h-11 rounded-md bg-accent px-5 text-sm font-semibold text-accent-ink transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Investigate provider
          </button>
        </div>
        <p className="mt-2 text-sm text-muted">
          A live investigation searches and reads real pages, so it takes one to three minutes. Any provider name works, not
          only the examples below.
        </p>
      </form>

      {health && !health.liveResearch && (
        <p className="mt-5 rounded-md border border-warn/30 bg-warn-soft px-4 py-3 text-sm text-warn">
          This server has no model API key, so live research is switched off. The Composio lookup still runs for any
          provider, and saved investigations open normally. Nothing is generated without the key.
        </p>
      )}

      <div className="mt-10">
        <h2 className="text-sm font-medium text-ink">Examples, each with a different setup challenge</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {(examples ?? []).map((e) => (
            <a
              key={e.slug}
              href={e.saved ? `#/saved/${e.slug}` : `#/run/${e.slug}`}
              className="group flex items-center justify-between gap-3 rounded-md border border-line bg-surface px-4 py-3 transition-colors hover:border-line-strong"
            >
              <span className="min-w-0">
                <span className="block font-medium text-ink">{e.name}</span>
                <span className="block truncate text-sm text-muted">{e.blurb}</span>
              </span>
              <span className="shrink-0 text-right text-xs text-muted">
                {e.saved && e.investigatedAt ? (
                  <>
                    Saved run
                    <br />
                    {formatDate(e.investigatedAt)}
                  </>
                ) : (
                  "Runs live"
                )}
              </span>
            </a>
          ))}
          {examples === null && <p className="text-sm text-muted">Loading examples…</p>}
        </div>
        <p className="mt-2 text-sm text-muted">
          Saved runs are earlier outputs of the same pipeline, kept so the examples open instantly. Each can be re-run live.
        </p>
      </div>

      <div className="mt-12 grid gap-8 border-t border-line pt-8 sm:grid-cols-3">
        <div>
          <h3 className="text-sm font-semibold">Managed or your own</h3>
          <p className="mt-1.5 text-sm text-ink-2">
            Read from Composio's live toolkit data: whether a Composio-managed OAuth app exists, or you have to register one
            and supply the client ID and secret.
          </p>
        </div>
        <div>
          <h3 className="text-sm font-semibold">Effort and review, separately</h3>
          <p className="mt-1.5 text-sm text-ink-2">
            Your hands-on time is an estimate. The provider's review time is only stated when the provider publishes it.
          </p>
        </div>
        <div>
          <h3 className="text-sm font-semibold">Who does what</h3>
          <p className="mt-1.5 text-sm text-ink-2">
            Each step says whether an agent can prepare it or a person has to do it. This tool researches; it does not act in
            provider consoles.
          </p>
        </div>
      </div>

      <div className="mt-8 rounded-md border border-line bg-surface p-4">
        <h3 className="text-sm font-semibold">How to read the labels</h3>
        <dl className="mt-3 grid gap-x-6 gap-y-2.5 text-sm sm:grid-cols-[auto_1fr]">
          <dt><StatusChip status="verified" /></dt>
          <dd className="text-ink-2">A page retrieved during the investigation says it, and the quote was found in that page's text.</dd>
          <dt><StatusChip status="inferred" /></dt>
          <dd className="text-ink-2">Reasoned, not quoted. Claims that fail the quote check are downgraded to this automatically.</dd>
          <dt><StatusChip status="unknown" /></dt>
          <dd className="text-ink-2">Looked for and not established. Review timelines land here unless the provider publishes one.</dd>
          <dt><ActorBadge actor="agent_prepares" /></dt>
          <dd className="text-ink-2">Research or drafting that needs no access to your accounts.</dd>
          <dt><ActorBadge actor="agent_assists" /></dt>
          <dd className="text-ink-2">An agent can prepare the inputs; a logged-in person performs or approves it.</dd>
          <dt><ActorBadge actor="human_only" /></dt>
          <dd className="text-ink-2">Accounts, terms, verification, payment, secrets and review submissions.</dd>
        </dl>
      </div>
    </div>
  );
}

export { Button };
