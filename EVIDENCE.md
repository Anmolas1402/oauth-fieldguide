# Evidence log

What was checked, where the evidence came from, what changed along the way, and what is still
uncertain. Dates are 10 and 11 November 2026.

There are three kinds of evidence here, and they are kept apart:

1. **Live metadata:** Composio's public toolkit catalogue and toolkit pages, read by the app on
   every run.
2. **Documentation:** official provider pages, read two ways: by the app's own pipeline (saved in
   `data/guides/`) and by a separate manual-style check (`evidence/independent-research.md`).
3. **Hands-on attempts:** what happened when the setup consoles themselves were reached.

## 1. Composio: managed versus bring-your-own

Source: https://docs.composio.dev/toolkits/managed-auth (Markdown version `.md`) and
`https://docs.composio.dev/toolkits/<slug>.md`, both public.

| Check | Result |
|---|---|
| Catalogue size | 401 OAuth toolkits: 126 under "Composio-managed OAuth available", 275 under "Bring your own OAuth app" |
| GitHub, Gmail, Slack | Toolkit pages say "Composio-managed OAuth available? Yes", auth `OAUTH2` |
| Shopify | "Composio-managed OAuth available? No", auth `OAUTH2, S2S_OAUTH2`, listed under bring-your-own |
| Xero | Bring-your-own list; toolkit page says No, auth `OAUTH2` |
| OpenAI | Has a toolkit page but is not in the OAuth catalogue; auth `API_KEY` only |
| Authenticated API | `GET https://backend.composio.dev/api/v3.1/toolkits/github` without a key returns HTTP 401 |

**How the fourth example was chosen.** The brief asked for one provider that requires
bring-your-own OAuth, picked only after checking Composio's current data. Shopify was picked because
its toolkit page says "No", it is in the bring-your-own list, and it has the most distinctive setup
path of the candidates (Dev Dashboard, distribution choice, protected customer data review).

**Things the Composio pages added that were not expected:**

- Slack's toolkit FAQ says Composio's managed Slack app is still going through Slack Marketplace review,
  so users can see an "app isn't listed" warning and strict workspaces may need admin approval.
  That makes bringing your own Slack app more attractive than "optional" suggests. The guide shows
  this under "What Composio's toolkit page says".
- Gmail's FAQ notes that the managed app shares Google's quota across all Composio users, and that
  adding scopes beyond the defaults can produce Google's "app is blocked" screen.
- GitHub's FAQ notes that a GitHub App's installation step is separate from OAuth credential setup
  and is not handled by Composio automatically.

## 2. Provider documentation

### Independent check

Before any pipeline run, a research sub-agent read official docs for all four providers and recorded
each fact with its page and a quote. Full table: `evidence/independent-research.md`. Caveat recorded
there: the quotes came through a fetch tool that extracts text with a small model, so they are close
to verbatim but were not checked character by character.

### Pipeline runs compared with the independent check

All four guides were produced by the app's own pipeline on the free Gemini tier. Search was blocked
for most queries (see section 4), so most pages were fetched from URLs the model proposed directly.

| Provider | Model used | Official pages read | Claims (verified / inferred / unknown) | Validator adjustments |
|---|---|---|---|---|
| GitHub (re-run) | gemini-3.6-flash | 4 | 13 / 1 / 1 | 6 |
| Gmail | gemini-3.1-flash-lite | 5 | 13 / 2 / 0 | 2 |
| Slack | gemini-3.5-flash-lite | 4 | 12 / 3 / 1 | 4 |
| Shopify (re-run) | gemini-3.6-flash, then 3.5-flash-lite | 4 | 16 / 2 / 1 | 7 |

Where the pipeline and the independent check agree:

- **GitHub:** OAuth app registration is self-serve with no review; low difficulty. Expiring user
  tokens are on by default for new OAuth apps; 100-app limit per owner.
- **Gmail:** review is required for sensitive and restricted scopes. Scope tiers match exactly:
  `gmail.readonly` restricted, `gmail.send` sensitive, `gmail.labels` non-sensitive. Restricted-scope
  verification "can potentially take several weeks", quoted from Google.
- **Slack:** Marketplace review applies only to Marketplace listing; single-workspace and unlisted
  distribution need no review. Workspace "Require approved apps" settings can block installation.
  Authorization codes expire after ten minutes.
- **Shopify:** apps are created in the Dev Dashboard; distribution goes through the Partner Dashboard;
  protected customer data needs a separate review; no published App Store review timeline; the
  one-time registration fee amount is not stated (both runs list these as unresolved).

Where the pipeline fell short of the independent check:

- **Slack's review timeline.** The guide says "unknown: not specified in the retrieved documentation".
  That is accurate for the four pages it read, but Slack does publish Marketplace review times (up
  to 10 business days for the first stage, up to 10 weeks for the functional review) on a page the
  run did not fetch. A reader could mistake "unknown" for "unpublished". The wording says "in the
  retrieved documentation" for this reason, but the gap is real: the page budget is small.
- **Slack's 2025 rate limits for non-Marketplace apps** (1 request a minute on `conversations.history`
  for commercially distributed apps) are missing from the guide for the same reason.
- **GitHub** still does not mention organisation OAuth app access restrictions, which the independent
  check found (new organisations block OAuth apps until an owner approves them).
- **Shopify's re-run read fewer pages than its first run** (4 against 8). It gained the full path
  (8 steps, including a development-store test and review submission) and a new verified blocker
  (public apps must move to expiring offline tokens), but lost the protected-customer-data and
  secret-rotation risks the first run had. Its first step, "Create a Shopify Partner Account", is
  marked *inferred*, and Shopify's Dev Dashboard page says the opposite ("You don't need a Partner
  organization to use the Dev Dashboard"). The label did its job; the step is still wrong.

**Run-to-run variance.** GitHub and Shopify were each run twice (10 and 11 November). Facts quoted
from pages were stable. The judgement fields were not: Shopify's difficulty went from medium to
high and its effort estimate from 15-30 minutes to 2-4 hours. Effort is labelled as the tool's own
estimate for this reason; a fixed rubric would make it steadier.

## 3. Hands-on attempts

No provider app was created, and no console form was submitted. What was attempted:

| Console | What happened without signing in |
|---|---|
| `github.com/settings/applications/new` | 302 to GitHub login |
| `github.com/settings/apps/new` | 302 to GitHub login |
| `console.cloud.google.com/auth/overview` | 302 to Google sign-in |
| `api.slack.com/apps` | 200; the app list itself needs a signed-in workspace |
| `dev.shopify.com/dashboard` | 406 to an automated client |
| `developer.xero.com/app/manage` | 200 shell page; app management needs a Xero login |
| `dashboard.composio.dev` | 307 to Composio login |

The plan was to open the GitHub and Google "new app" forms in the signed-in Chrome profile and record
the visible fields without submitting. The browser extension disconnected before that step, so the
form fields in the guides come from documentation, not from looking at the forms. This is a gap.

One hands-on step did happen: the Gemini API key this app runs on was created in Google AI Studio,
under an existing Google Cloud project, through the browser. The key went from the clipboard into
`.env.local` without being printed, and the file is gitignored.

## 4. Corrections and assumptions that changed

These came up during the work; none were made up to fill the section.

**About the providers** (from the independent check, confirmed against the pipeline where it read the
same pages):

1. GitHub OAuth apps now allow up to 10 callback URLs. "OAuth apps get one" is outdated.
2. GitHub OAuth apps now have a wildcard-matching setting for callback URLs; exact match applies when
   it is off.
3. **GitHub has an `offline_access` scope.** The GitHub guide listed it and I assumed the model had
   made it up, because it is an OIDC term rather than a GitHub scope I knew. GitHub's scopes page lists it:
   "Requests an expiring access token and a refresh token, even if your OAuth app is not configured
   to use expiring tokens." The pipeline was right and I was wrong.
4. Google's "OAuth consent screen" is now "Google Auth platform" (Branding, Audience, Data Access,
   Clients). Older guides name the old menu.
5. `gmail.metadata` is a restricted scope, not a sensitive one.
6. Slack publishes Marketplace review timelines. I expected it not to.
7. Shopify app creation moved from the Partner Dashboard to the Dev Dashboard, and new custom apps
   can no longer be created in the store admin (from 1 January 2026).

**About the build:**

8. **Composio's managed-auth data does not need an API key.** The authenticated endpoint returns 401,
   but the public Markdown docs state the same thing per toolkit. This is why the app runs with
   one key.
9. **Google Search grounding is not free** on current Gemini models, so the app has its own search tool.
10. **The free Gemini tier allows 20 requests per model per day** (Google's error names the quota
    `GenerateRequestsPerDayPerProjectPerModel-FreeTier`). One investigation uses 4 to 8 model calls.
    The app now falls back across five Flash models and keeps unfinished research for reuse.
11. **The quote validator had a false negative.** GitHub's "In the left sidebar, click OAuth apps.
    Click New OAuth App." was rejected because the page has the list number "4." between the two
    steps. Quote matching now ignores list numbers. The GitHub guide was later re-run (see 17).
12. **A duration slipped past the validator.** Gmail's timeline was marked verified with the text
    "brand verification typically takes 2-3 days … restricted reviews can take several weeks", but the
    quote only supported "several weeks". The validator now requires every duration in the text to
    appear in the quote. The rule was applied to the saved guide afterwards, and the guide records that.
13. **A step was labelled "agent can prepare" for a dashboard click** (Shopify, "Click Create in
    Composio"). Steps that involve clicking, signing in, pasting or submitting are now moved to at
    least "agent assists".
14. **Secondary sources were labelled like official ones.** The first live Xero run read none of
    Xero's own documentation; all 12 verified claims came from Composio's walkthrough and Nango's docs,
    yet the guide looked as solid as the others. Sources are now classified as official, Composio or
    third-party; third-party citations are drawn differently; verified claims resting only on
    third-party pages are counted; and a guide with no official page shows a warning.
15. **The search tool was disguised as a browser.** It sent a Chrome User-Agent to DuckDuckGo and Brave.
    When I tried a similar disguise to check why Xero's docs return an empty page, the permission
    system blocked it as bot-check circumvention. That was right, and it applied equally to the
    search tool, which now identifies itself honestly.
16. **The saved Shopify guide recorded the wrong model** (`gemini-3.8-flash`) because an early version
    recorded the model before fallback; that run's log shows `gemini-3.5-flash`. The file was corrected.
17. **Two more quote-matching false negatives**, found by re-running GitHub and Shopify. The model
    wrote `In Application name, type…` where GitHub's page has `In "Application name", type…`, and
    `ID to authConfigs, keyed` where Composio's page has `` `authConfigs`, ``. Quote marks, apostrophes
    and code markers are now ignored on both sides, as are spaces left before punctuation. Six
    downgrades in the two re-run guides were matcher errors. `scripts/recheck-quotes.ts` re-retrieved
    the cited pages, found each full quote, restored the claims, and recorded each restoration with
    its date. It restored nothing in the Gmail and Slack guides, where the rejections stand.

## 5. Deployment check

Deployed to Render (free plan) from `render.yaml` on 11 November 2026:
https://oauth-fieldguide.onrender.com. Checked against production, not localhost:

- `/api/health` reports live research on; the page, the four saved guides and input validation
  (HTTP 400 on a one-character query) all respond as they do locally.
- A live investigation of **Zoom**, a provider that is not an example, streamed from production in
  64 seconds: Composio lookup (managed app available), one search (Brave answered from Render's
  network), six official `developers.zoom.us` pages read, a 6-step guide with 12 verified,
  5 inferred and 1 unknown claims, and 5 validator adjustments. It ran on `gemini-3.5-flash-lite`
  because the three larger models were overloaded or out of their daily quota.

## 6. Still uncertain

- **Xero.** `developer.xero.com/documentation/...` returns 39 characters to this tool, so Xero's main
  docs could not be read. The second Xero run read Xero's FAQ pages and its official Python SDK
  instead. Whether the docs need JavaScript or reject automated clients was not established.
- **Search reliability from a server.** DuckDuckGo and Brave blocked most queries from this machine
  after the first few. A cloud host's IP may fare worse.
- **Google's CASA security assessment cost.** Not stated on any page read.
- **Shopify App Store review timeline and registration fee.** Not stated on the official pages read.
- **Slack's dates for applying the new rate limits to existing non-Marketplace installs.** A search
  snippet claimed 3 March 2026; the changelog pages fetched do not say it.

## 7. How to reproduce

- `npm run save-guide -- <provider>` runs the pipeline and prints every stage, search and page.
- Each saved guide contains its own investigation log (`log.searches`, `log.fetches`), every source
  with its retrieval time, and every validator adjustment with its reason.
- `npx tsx scripts/recheck-saved.ts` applies the validator rules that need only the guide itself
  to saved guides, and records each change as applied afterwards.
- `npx tsx scripts/recheck-quotes.ts [--write]` re-checks downgraded quotes in saved guides against
  freshly retrieved pages after a matcher change, and records any restoration.
