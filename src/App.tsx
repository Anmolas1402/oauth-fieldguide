import { useCallback, useEffect, useRef, useState } from "react";
import type { Activity, ComposioFacts, Guide, NoOAuthResult, PipelineEvent, StageId } from "../shared/schema.ts";
import { STAGES } from "../shared/schema.ts";
import { getExamples, getHealth, getSavedGuide, streamInvestigation, type Example, type Health } from "./api.ts";
import { GuideView } from "./components/GuideView.tsx";
import { Home } from "./components/Home.tsx";
import { NoOAuthView, RunView } from "./components/RunView.tsx";

export type StageState = { state: "pending" | "running" | "done" | "failed" | "skipped"; detail?: string; activities: Activity[] };
export type RunState = {
  query: string;
  startedAt: number;
  endedAt: number | null;
  stages: Record<StageId, StageState>;
  composio: ComposioFacts | null;
  error: { code: string; message: string } | null;
  active: boolean;
};

type Route = { name: "home" } | { name: "saved"; slug: string } | { name: "run"; query: string };

function parseRoute(): Route {
  const h = decodeURIComponent(window.location.hash.replace(/^#\/?/, ""));
  if (h.startsWith("saved/")) return { name: "saved", slug: h.slice(6) };
  if (h.startsWith("run/")) return { name: "run", query: h.slice(4) };
  return { name: "home" };
}

const emptyStages = () =>
  Object.fromEntries(STAGES.map((s) => [s.id, { state: "pending", activities: [] }])) as unknown as Record<StageId, StageState>;

export function App() {
  const [route, setRoute] = useState<Route>(parseRoute);
  const [health, setHealth] = useState<Health | null>(null);
  const [healthError, setHealthError] = useState(false);
  const [examples, setExamples] = useState<Example[] | null>(null);
  const [run, setRun] = useState<RunState | null>(null);
  const [guide, setGuide] = useState<Guide | null>(null);
  const [noOAuth, setNoOAuth] = useState<NoOAuthResult | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const freshRef = useRef(false);

  useEffect(() => {
    const onHash = () => setRoute(parseRoute());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    // One retry covers the dev case where the web server is up a moment before the API.
    const retry = <T,>(fn: () => Promise<T>) => fn().catch(() => new Promise<T>((res, rej) => setTimeout(() => fn().then(res, rej), 1500)));
    retry(getHealth).then(setHealth).catch(() => setHealthError(true));
    retry(getExamples).then(setExamples).catch(() => setExamples([]));
  }, []);

  const start = useCallback((query: string, fresh: boolean) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setGuide(null);
    setNoOAuth(null);
    setLoadError(null);
    setRun({ query, startedAt: Date.now(), endedAt: null, stages: emptyStages(), composio: null, error: null, active: true });

    const apply = (e: PipelineEvent) => {
      if (e.type === "result") {
        setGuide(e.guide);
        return;
      }
      if (e.type === "no_oauth") {
        setNoOAuth(e.result);
        return;
      }
      setRun((prev) => {
        if (!prev) return prev;
        const next = { ...prev, stages: { ...prev.stages } };
        if (e.type === "stage") {
          next.stages[e.id] = { ...next.stages[e.id], state: e.state, detail: e.detail };
        } else if (e.type === "activity") {
          const st = next.stages[e.stage];
          const i = st.activities.findIndex((a) => a.id === e.activity.id);
          const activities = i === -1 ? [...st.activities, e.activity] : st.activities.map((a, j) => (j === i ? e.activity : a));
          next.stages[e.stage] = { ...st, activities };
        } else if (e.type === "composio") {
          next.composio = e.facts;
        } else if (e.type === "error") {
          next.error = { code: e.code, message: e.message };
        }
        return next;
      });
    };

    streamInvestigation(query, fresh, apply, controller.signal)
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        const message = err instanceof Error ? err.message : "Unexpected error.";
        setRun((prev) => (prev ? { ...prev, error: prev.error ?? { code: "client", message } } : prev));
      })
      .finally(() => {
        if (abortRef.current === controller) setRun((prev) => (prev ? { ...prev, active: false, endedAt: Date.now() } : prev));
      });
  }, []);

  // Route changes drive what is loaded.
  useEffect(() => {
    if (route.name === "home") {
      abortRef.current?.abort();
      setRun(null);
      setGuide(null);
      setNoOAuth(null);
      setLoadError(null);
      return;
    }
    if (route.name === "saved") {
      abortRef.current?.abort();
      setRun(null);
      setGuide(null);
      setNoOAuth(null);
      setLoadError(null);
      let cancelled = false;
      getSavedGuide(route.slug)
        .then((g) => {
          if (cancelled) return;
          if (g) setGuide(g);
          else window.location.hash = `#/run/${encodeURIComponent(route.slug)}`;
        })
        .catch((err: unknown) => !cancelled && setLoadError(err instanceof Error ? err.message : "Could not load."));
      return () => {
        cancelled = true;
      };
    }
    const fresh = freshRef.current;
    freshRef.current = false;
    start(route.query, fresh);
    return () => abortRef.current?.abort();
  }, [route, start]);

  const investigate = (query: string, fresh = false) => {
    const q = query.trim();
    if (!q) return;
    freshRef.current = fresh;
    const target = `#/run/${encodeURIComponent(q)}`;
    if (window.location.hash === target) start(q, fresh);
    else window.location.hash = target;
  };

  const goHome = () => {
    window.location.hash = "#/";
  };

  return (
    <div className="min-h-screen">
      <header className="no-print sticky top-0 z-20 border-b border-line bg-bg/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <a href="#/" className="flex items-center gap-2.5 font-semibold tracking-tight text-ink">
            <img src="/favicon.svg" alt="" className="h-6 w-6" />
            OAuth Fieldguide
          </a>
          <nav className="flex items-center gap-4 text-sm text-muted">
            {health && (
              <span className="hidden items-center gap-1.5 sm:flex" title={health.liveResearch ? `Model: ${health.model}` : "The server has no model API key"}>
                <span className={`h-1.5 w-1.5 rounded-full ${health.liveResearch ? "bg-ok" : "bg-warn"}`} />
                {health.liveResearch ? "Live research on" : "Live research off"}
              </span>
            )}
            <a className="hover:text-ink" href="https://docs.composio.dev/toolkits/managed-auth" target="_blank" rel="noreferrer">
              Composio catalogue
            </a>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
        {healthError && (
          <p className="mt-6 rounded-md border border-bad/30 bg-bad-soft px-4 py-3 text-sm text-bad">
            The API server is not reachable. Start it with <code className="font-mono">npm run dev</code> and reload.
          </p>
        )}
        {route.name === "home" && <Home examples={examples} health={health} onInvestigate={investigate} />}

        {route.name === "saved" && !guide && (
          <p className="mt-16 text-center text-sm text-muted">{loadError ?? "Loading saved investigation…"}</p>
        )}

        {route.name === "run" && run && !guide && !noOAuth && (
          <RunView run={run} onRetry={() => investigate(run.query, true)} onHome={goHome} onPick={(slug) => investigate(`slug:${slug}`)} />
        )}

        {noOAuth && <NoOAuthView result={noOAuth} onHome={goHome} />}

        {guide && (
          <GuideView
            guide={guide}
            liveAvailable={health?.liveResearch ?? false}
            onRerun={() => investigate(guide.composio.slug ? `slug:${guide.composio.slug.toLowerCase()}` : guide.meta.query, true)}
            onPick={(slug) => investigate(`slug:${slug}`)}
            onHome={goHome}
          />
        )}
      </main>
    </div>
  );
}
