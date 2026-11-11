import type { Guide, PipelineEvent } from "../shared/schema.ts";

export type Health = { ok: boolean; liveResearch: boolean; model: string | null };
export type Example = { slug: string; name: string; blurb: string; saved: boolean; investigatedAt: string | null };

export async function getHealth(): Promise<Health> {
  const res = await fetch("/api/health");
  if (!res.ok) throw new Error(`health check failed (HTTP ${res.status})`);
  return res.json();
}

export async function getExamples(): Promise<Example[]> {
  const res = await fetch("/api/examples");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()).examples;
}

export async function getSavedGuide(slug: string): Promise<Guide | null> {
  const res = await fetch(`/api/guides/${encodeURIComponent(slug)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Could not load the saved investigation (HTTP ${res.status}).`);
  return (await res.json()).guide;
}

/** Streams pipeline events (newline-delimited JSON) from the server as they happen. */
export async function streamInvestigation(
  query: string,
  fresh: boolean,
  onEvent: (e: PipelineEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch("/api/investigate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query, fresh }),
      signal,
    });
  } catch (err) {
    if (signal.aborted) throw err;
    throw new Error("Could not reach the server. Check your connection and that the API is running.");
  }
  if (!res.ok || !res.body) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `The server returned HTTP ${res.status}.`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let sawTerminal = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      let event: PipelineEvent;
      try {
        event = JSON.parse(line);
      } catch {
        continue;
      }
      if (event.type === "result" || event.type === "error" || event.type === "no_oauth") sawTerminal = true;
      if (event.type !== "ping") onEvent(event);
    }
  }
  if (!sawTerminal) throw new Error("The connection closed before the investigation finished.");
}
