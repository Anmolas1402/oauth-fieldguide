# OAuth Fieldguide

Know what it takes to launch an OAuth integration before you start building it.

Type a provider name. Fieldguide checks Composio's live toolkit data to see whether a
Composio-managed OAuth app exists or you must register your own, then searches for and reads the
provider's own documentation and writes a setup guide. Every claim in the guide is labelled
**verified**, **inferred** or **unknown**, and a validator downgrades any "verified" claim whose
quote is not found in the page it cites.

It is an investigation and guidance tool. It does not perform OAuth, does not log in to provider
consoles, and never asks for a client secret.

## Run it locally

Requires Node 20.6 or newer.

```bash
npm install
cp .env.example .env.local
```

Put your Anthropic API key in `.env.local` as `ANTHROPIC_API_KEY=...`. The file is gitignored. The key
is read only by the server process and is never sent to the browser.

```bash
npm run dev
```

Open http://localhost:5173. The API runs on port 8787 and Vite proxies `/api` to it.

Without a key the app still starts: the Composio lookup works for any provider, saved investigations
open, and the research stage fails with a clear message instead of producing anything.

```bash
npm test          # unit tests
npm run build     # typecheck and production client build
npm start         # production server: API plus built client on $PORT (default 8787)
```

## Test an unfamiliar provider live

1. Start the app with a key configured. The header shows "Live research on".
2. Type any provider that is not one of the four examples, for example `Xero`, `Zoom`, `HubSpot`,
   `DocuSign` or `Calendly`, and press **Investigate provider**.
3. Watch the progress screen. Each row is emitted by the server when the operation actually
   completes: the Composio catalogue read, the toolkit page read, every web search with its result
   count, and every page fetch with the number of characters read or the reason it failed.
4. After one to three minutes the guide opens. Check section 6, **Sources and confidence**: it lists
   every page retrieved, which claims each supports, the validator's adjustments, and the full
   search and fetch log.

Things worth trying:

| Input | What it shows |
|---|---|
| `Xero` or `DocuSign` | A bring-your-own provider: managed OAuth "Not available", own app "Required" |
| `Google` | An ambiguous name: the assumption is displayed with alternatives to pick |
| `OpenAI` | A toolkit with API-key auth: the research stages are skipped, not faked |
| `Zzqqx Corp` | A provider that does not exist: the guide says it could not be identified |
| Stop the API mid-run | The UI reports the dropped connection and offers a retry |

The four example chips open **saved** investigations: earlier outputs of the same pipeline stored in
`data/guides/`, labelled with their date. **Re-run live** on any of them runs the full pipeline again.
To regenerate one: `npm run save-guide -- github`.

## How it works

```
browser ── POST /api/investigate ──> server (Hono, Node)
   ^                                   1 resolve   match the name against Composio's public catalogue
   └──── NDJSON events, live ────────  2 composio  read the toolkit page: auth schemes, managed yes/no
                                       3 research  Claude + web search + fetch_page tool (real HTTP)
                                       4 compose   Claude, structured output against a Zod schema
                                       5 verify    deterministic cross-check, no model involved
```

- **Stages 1 and 2 use no model.** `server/composio.ts` reads
  `docs.composio.dev/toolkits/managed-auth.md` and `docs.composio.dev/toolkits/<slug>.md`, which are
  public. The managed / bring-your-own answer in the guide comes only from this data; the model is
  told not to contradict it and has no field to write it in.
- **Stage 3 is an agent loop** (`server/research.ts`). The model searches with Anthropic's web search
  tool and reads pages through `fetch_page`, a tool this server executes (`server/fetchPage.ts`):
  https only, public hosts only, redirects re-checked, 30,000 characters per page, at most 9 pages
  and 6 searches. The server keeps the text of every page it retrieved.
- **Stage 4** (`server/compose.ts`) gets those page texts and the research notes and must return JSON
  matching `GuideDraftSchema` in `shared/schema.ts`. Sources can only be cited by the ids the server
  assigned, so a URL that was not retrieved cannot appear as a source.
- **Stage 5** (`server/verify.ts`) is plain code:
  - a "verified" claim needs a cited, retrieved page and a quote found in that page's text, otherwise
    it becomes "inferred";
  - citations to ids that were never retrieved are removed;
  - a review duration that is not verified is deleted and replaced with "no timeline published";
  - scope strings and console links are flagged when they do not appear in any retrieved page.
  Every change is listed in the guide under "Validator adjustments".

### Layout

```
server/    API, pipeline, Composio reader, page fetcher, validator
shared/    Zod schema and types, Markdown export, labels (used by server and client)
src/       React client (Vite, Tailwind)
data/guides/   saved investigations (pipeline output, JSON)
tests/     unit tests (Vitest)
evidence/  the independent documentation check behind EVIDENCE.md
```

## Environment variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | for live research | none | Model, web search |
| `ANTHROPIC_MODEL` | no | `claude-opus-5-5` | Model for research and guide writing |
| `ANTHROPIC_EFFORT` | no | `medium` | Reasoning effort |
| `ANTHROPIC_FALLBACKS` | no | on | Set to `off` to disable server-side refusal fallback |
| `PORT` | no | `8787` | Production server port |
| `API_PORT` | no | `8787` | API port in `npm run dev` |
| `RATE_LIMIT_PER_HOUR` | no | `6` | Live investigations per IP per hour |
| `DAILY_LIVE_RUN_CAP` | no | `60` | Live investigations per day across all users |

No Composio key is needed. No provider OAuth credentials are used anywhere.

## Deploy

The app is one Node process (`npm start`) that serves the API and the built client. It needs a host
that allows a streaming response to stay open for a few minutes.

- **Render:** `render.yaml` is included. New > Blueprint, pick the repo, set `ANTHROPIC_API_KEY`.
- **Anything that runs a container:** `Dockerfile` is included (listens on `$PORT`, default 8080).

## Limitations

- **Pages that need JavaScript or a login cannot be read.** The fetcher gets server-rendered HTML
  only. Such pages show up in the log as failed, and claims that depended on them stay unverified.
- **"Verified" means "a retrieved page says this", not "this was tested in the provider's console".**
  Nothing here creates an app or submits a form.
- **Hands-on effort is the tool's estimate.** It is labelled as such and kept apart from provider
  review time, which is only shown when quoted from a retrieved page.
- **The managed / bring-your-own answer is read from Composio's public docs pages**, not the
  authenticated `GET /api/v3.1/toolkits/{slug}` endpoint, so it is per toolkit, not per auth scheme.
- **Quote matching is lenient about formatting** (case, quote marks, link targets, 80% of five-word
  runs). It can pass a quote with a small wording difference.
- **Budgets are small on purpose** (9 pages, 6 searches). Providers with sprawling docs get a guide
  with more "unknown" entries rather than a longer run.
- **Rate limits and the result cache are in memory**, so they reset on restart and do not span
  multiple instances.
- **A live run takes one to three minutes** and costs model tokens. Repeat requests for the same
  provider within six hours replay the cached result unless "Re-run live" is used.

See `EVIDENCE.md` for what was checked and corrected, `PRODUCT_DECISIONS.md` for scope and
trade-offs, and `DEMO_SCRIPT.md` for a three-minute walkthrough.
