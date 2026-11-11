# Product decisions

## The problem picked

A developer adding a third-party integration cannot tell in advance whether it is a 20-minute
form or a multi-week review. The information exists but is spread over provider docs that change,
and generic "how to set up OAuth" answers blur three different things: registering an OAuth app,
configuring the integration, and an end user's consent.

Fieldguide answers one question well: **what does it take to register and launch your own OAuth app
for provider X, and do you even need to?**

## Scope: one workflow

Search a provider > watch the investigation > read the guide > export it. Three screens, one path.

Built:

- Managed vs bring-your-own from Composio's live data, decided without the model.
- A real research loop with server-executed page retrieval, for any provider name.
- A guide in seven sections, each claim carrying a status, sources and a quote.
- A deterministic validator that downgrades unsupported claims and removes unsupported timelines.
- Effort and review time shown in separate boxes with different provenance.
- Agent / human split per step, with the reason.
- Step checkboxes, Markdown export, copyable checklist.
- Honest failure states: no key, unknown provider, API-key toolkit, dropped connection, rate limit.

## Decisions and their trade-offs

| Decision | Why | Cost |
|---|---|---|
| Composio facts come from public docs pages, not the authenticated API | An evaluator can run it with one key; the pages state the same answer | Per-toolkit, not per-auth-scheme granularity |
| The server fetches pages itself instead of using a hosted fetch tool | The server holds the exact text, so quotes can be checked in code and progress events are exact | JS-rendered and login-gated pages fail |
| Two model calls (research, then compose) | Research needs tools and free-form notes; composing needs a strict schema. Separating them keeps both simple | Slower than one call |
| Validation is code, not a second model opinion | "Is this quote in this page" is a string question. A model check would add another thing to distrust | It checks presence of the quote, not whether the claim follows from it |
| Three statuses, no confidence percentage | A number would be invented. The three states map to things that actually happened | Coarser than a score |
| Review timelines are deleted unless quoted | A wrong "2 to 3 weeks" is worse than "not published" for someone planning a launch | Sometimes drops a duration that is true but was not on a retrieved page |
| Examples open saved runs | A demo should not wait three minutes four times | Saved runs can go stale, so they are dated and re-runnable |
| Single Node process, in-memory limits | Deployable anywhere with one command | No horizontal scaling |
| Small research budget (9 pages, 6 searches) | Keeps runs to a few minutes and a few cents | More "unknown" for providers with sprawling docs |

## Agent vs human: where the line was drawn

The product can read public pages and draft things. It cannot log in anywhere. So nothing is
labelled "automated". The three labels describe what an agent could responsibly do:

- **Agent can prepare:** research and drafts that need no account access.
- **Agent assists, you authorize:** the agent prepares inputs; a logged-in person submits.
- **You only:** accounts, terms, identity or business verification, payment, secrets, review submission.

Client secrets are always "you only". The app has no field that accepts one.

## Rejected

- **Performing the OAuth flow or creating provider apps.** The assignment is about investigating
  setup; doing it needs real accounts and secrets and would shift attention from guidance to plumbing.
- **Browser automation of provider consoles.** Fragile, account-bound, and it would make the
  "agent can do this" labels a promise the product cannot keep reliably.
- **A library of 100 pre-written guides.** They would be stale on day one and say nothing about
  whether the pipeline works on an unfamiliar provider.
- **Accounts, saved history, sharing.** Not needed to prove the workflow.
- **A chat interface.** The output is a document with a fixed shape; a form field is enough.
- **Confidence scores, time-to-approval predictions.** Would be fabricated precision.
- **Side-by-side provider comparison.** Useful later; needs the single-provider guide to be trusted first.

## What I would do next

1. Use the authenticated Composio toolkit endpoint when a key is present, for per-scheme accuracy.
2. A headless-browser fallback for docs that need JavaScript.
3. Re-check saved guides on a schedule and show a diff when a provider's requirements change.
4. Let the developer state their use case (scopes needed, single-tenant or public) so the review
   answer is specific rather than conditional.
