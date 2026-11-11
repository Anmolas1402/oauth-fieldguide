import type { ReactNode } from "react";
import { ACTOR_HELP, ACTOR_LABEL, STATUS_HELP, STATUS_LABEL } from "../../shared/derive.ts";
import type { Actor, Claim, Source, Status } from "../../shared/schema.ts";

const STATUS_STYLE: Record<Status, string> = {
  verified: "bg-ok-soft text-ok",
  inferred: "bg-warn-soft text-warn",
  unknown: "bg-idle-soft text-idle",
};

export function StatusChip({ status }: { status: Status }) {
  return (
    <span
      title={STATUS_HELP[status]}
      className={`inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium ${STATUS_STYLE[status]}`}
    >
      <StatusGlyph status={status} />
      {STATUS_LABEL[status]}
    </span>
  );
}

function StatusGlyph({ status }: { status: Status }) {
  if (status === "verified")
    return (
      <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden>
        <path d="M2.5 6.4 5 8.8l4.5-5.3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  if (status === "inferred")
    return (
      <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden>
        <path d="M2 6c1.2-2 2.3-2 3.5 0s2.3 2 3.5 0" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  return (
    <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden>
      <circle cx="6" cy="6" r="3.6" fill="none" stroke="currentColor" strokeWidth="1.4" strokeDasharray="2 1.6" />
    </svg>
  );
}

const ACTOR_STYLE: Record<Actor, string> = {
  agent_prepares: "border-line-strong text-ink-2",
  agent_assists: "border-line-strong text-ink-2",
  human_only: "border-ink/60 text-ink",
};

export function ActorBadge({ actor }: { actor: Actor }) {
  return (
    <span
      title={ACTOR_HELP[actor]}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded border px-1.5 py-0.5 text-xs font-medium ${ACTOR_STYLE[actor]}`}
    >
      <ActorGlyph actor={actor} />
      {ACTOR_LABEL[actor]}
    </span>
  );
}

export function ActorGlyph({ actor }: { actor: Actor }) {
  // Agent = square, human = circle, shared = both.
  return (
    <svg viewBox="0 0 18 12" className="h-3 w-[18px]" aria-hidden>
      {actor !== "human_only" && <rect x="1" y="2" width="8" height="8" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.4" />}
      {actor !== "agent_prepares" && <circle cx={actor === "human_only" ? 6 : 12.5} cy="6" r="4" fill="currentColor" />}
    </svg>
  );
}

export function SourceRefs({ ids, sources }: { ids: string[]; sources: Source[] }) {
  if (!ids.length) return null;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {ids.map((id) => {
        const s = sources.find((x) => x.id === id);
        return s ? (
          <a
            key={id}
            href={s.url}
            target="_blank"
            rel="noreferrer"
            title={`${s.title}\n${s.url}`}
            className="rounded border border-line px-1 font-mono text-[11px] leading-5 text-muted hover:border-accent hover:text-accent"
          >
            {id}
          </a>
        ) : null;
      })}
    </span>
  );
}

/** One evidence-carrying statement: text, status, sources, and the supporting quote on demand. */
export function ClaimLine({ claim, sources, lead }: { claim: Claim; sources: Source[]; lead?: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-ink">
        {lead}
        {claim.text}
      </p>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
        <StatusChip status={claim.status} />
        <SourceRefs ids={claim.sourceIds} sources={sources} />
        {claim.quote && (
          <details className="group basis-full">
            <summary className="inline text-xs text-muted underline decoration-line-strong hover:text-ink">
              <span className="group-open:hidden">Show quote</span>
              <span className="hidden group-open:inline">Hide quote</span>
            </summary>
            <blockquote className="mt-1.5 border-l-2 border-line-strong pl-3 text-sm text-ink-2">“{claim.quote}”</blockquote>
          </details>
        )}
      </div>
    </div>
  );
}

export function Section({ id, n, title, hint, children }: { id: string; n: number; title: string; hint?: string; children: ReactNode }) {
  return (
    <section id={id} className="border-t border-line pt-8">
      <div className="mb-5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-lg font-semibold tracking-tight">
          <span className="mr-2 font-mono text-sm font-normal text-muted">{n}</span>
          {title}
        </h2>
        {hint && <p className="text-sm text-muted">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

export function Button({
  children,
  onClick,
  variant = "secondary",
  disabled,
  type = "button",
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost";
  disabled?: boolean;
  type?: "button" | "submit";
  title?: string;
}) {
  const style =
    variant === "primary"
      ? "bg-accent text-accent-ink hover:opacity-90 border-transparent"
      : variant === "ghost"
        ? "border-transparent text-ink-2 hover:bg-sunken"
        : "border-line-strong bg-surface text-ink hover:bg-sunken";
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`inline-flex h-9 items-center justify-center gap-2 rounded-md border px-3.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${style}`}
    >
      {children}
    </button>
  );
}

export const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};
