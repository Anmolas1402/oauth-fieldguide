# Independent documentation check (10 Nov 2026)

This is a manual-style check of the four example providers, done separately from the product's
pipeline so the pipeline's output has something to be compared against. A research sub-agent read
official provider documentation only and reported each fact with the page it came from.

Method caveat: the pages were read through a fetch tool that returns extracted text via a small
model, not raw HTML. Quotes below are as that tool reported them. Two GitHub facts came back as a
summary without a verbatim quote and are marked. Nothing here was checked in a logged-in console.

## GitHub

| Fact | Source | Quote |
|---|---|---|
| OAuth apps are registered under Settings > Developer settings > OAuth apps > New OAuth App | docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app | "You can create and register an OAuth app under your personal account" |
| Form fields: Application name, Homepage URL, description (optional), Authorization callback URL, Enable Device Flow | same | "In "Authorization callback URL", type the callback URL of your app." |
| Up to 10 callback URLs per OAuth app | same | "You can enter up to 10 callback URLs." |
| An owner can have up to 100 OAuth apps | same | "A user or organization can own up to 100 OAuth apps." |
| "Expire user access tokens" setting exists on OAuth apps, on by default | same | summary only, no verbatim quote |
| Exact redirect match when wildcard matching is off | docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps | "When wildcard matching is disabled, the redirect URL must exactly match the callback URL." |
| Wildcard matching is flagged as a risk | same | "Enabling wildcard matching can expose your app to security risks." |
| Single-callback apps from before 3 Aug 2026 have wildcard matching on by default | same | summary only, no verbatim quote |
| PKCE supported, S256 only | same | "Must be `S256` - the `plain` code challenge method is not supported." |
| Scopes never exceed the user's own permissions | .../scopes-for-oauth-apps | "They do not grant any additional permission beyond that which the user already has." |
| GitHub recommends GitHub Apps over OAuth apps | .../differences-between-github-apps-and-oauth-apps | "In general, GitHub Apps are preferred over OAuth apps." |
| Public GitHub App: anyone can install and authorize | docs.github.com/en/apps/creating-github-apps/registering-a-github-app/making-a-github-app-public-or-private | "any user on GitHub can install it and authorize it." |
| New orgs restrict OAuth app access by default | docs.github.com/en/organizations/managing-oauth-access-to-your-organizations-data/about-oauth-app-access-restrictions | "When you create a new organization, OAuth app access restrictions are enabled by default." |
| Members can request owner approval for a blocked app | same | "Users can request owner approval for OAuth apps they'd like to use" |
| Expiring user tokens: 8 hours, refresh 6 months | .../best-practices-for-creating-an-oauth-app | "The access token expires after eight hours, and the refresh token expires after six months." |
| Marketplace listing is optional; publisher verification only for paid plans and the badge | docs.github.com/en/apps/github-marketplace/github-marketplace-overview/about-github-marketplace-for-apps | "To publish paid plans for your app and display a marketplace badge, you must complete the publisher verification process." |

## Google / Gmail

| Fact | Source | Quote |
|---|---|---|
| APIs are enabled per Google Cloud project | developers.google.com/workspace/guides/enable-apis | "Before using Google APIs, you need to turn them on in a Google Cloud project." |
| Consent screen is now under "Google Auth platform": Branding, Audience, Data Access | developers.google.com/workspace/guides/configure-oauth-consent | "configure the following OAuth Consent Screen settings in Branding, Audience, and Data Access" |
| OAuth clients are created at Google Auth platform > Clients | developers.google.com/workspace/guides/create-credentials | "go to Menu > Google Auth platform > Clients" |
| Testing status: at most 100 test users | support.google.com/cloud/answer/15549945 | "limited to up to 100 test users listed in the OAuth consent screen." |
| Testing status: authorizations expire after 7 days | same | "Authorizations by a test user will expire seven days from the time of consent." |
| Unverified-app user cap is 100 for the project's lifetime | same | "The user cap applies over the entire lifetime of the project, and it cannot be reset or changed." |
| Sensitive Gmail scope: `gmail.send` | developers.google.com/workspace/gmail/api/auth/scopes | "They require additional OAuth App Verification." |
| Restricted Gmail scopes: `https://mail.google.com/`, `gmail.readonly`, `gmail.compose`, `gmail.insert`, `gmail.modify`, `gmail.metadata`, `gmail.settings.basic`, `gmail.settings.sharing` | same | "require restricted scope OAuth App Verification" |
| Security assessment when restricted data is stored or transmitted on servers | same | "If you store restricted scope data on servers (or transmit), then you must go through a security assessment." |
| Verification not needed for personal use, testing, internal-only apps | support.google.com/cloud/answer/13464323 | "If the app is for your personal use (fewer than 100 users)" |
| Verification needs homepage, privacy policy, demo video, scope justification, verified domains | support.google.com/cloud/answer/13464321 | "You must verify that you own all domains listed in your Authorized domains section" |
| Sensitive scope verification timeline | developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification | "The sensitive scope verification process can take up to 10 days to complete." |
| Restricted scope verification timeline: no number | .../restricted-scope-verification | "the restricted scopes verification process can potentially take several weeks to complete" |
| Restricted scopes need an assessment by Google-empanelled assessors, repeated every 12 months | same | "must go through a security assessment from Google-empanelled security assessors" |
| Redirect URIs must be HTTPS (localhost exempt), exact match, no wildcards, no raw IPs | developers.google.com/identity/protocols/oauth2/web-server | "Redirect URIs must use the HTTPS scheme, not plain HTTP." |
| Client secret shown in full once | support.google.com/cloud/answer/15549257 | "you will only be able to view and download the full client secret once, at the time of its creation." |
| Inactive OAuth clients are deleted after six months | same | "OAuth 2.0 clients that have been inactive for six months are automatically deleted." |

## Slack

| Fact | Source | Quote |
|---|---|---|
| Apps are created from the apps page against a development workspace | docs.slack.dev/app-management/quickstart-app-settings | "Select the Workspace where you'll be developing your app." |
| Scopes are added under OAuth & Permissions > Bot Token Scopes | same | "Under Bot Token Scopes, select Add an OAuth Scope." |
| Apps can be created from a manifest | docs.slack.dev/app-manifests/configuring-apps-with-app-manifests | "Manifests are YAML or JSON-formatted configurations bundles for Slack apps." |
| `redirect_uri` must be HTTPS | docs.slack.dev/authentication/installing-with-oauth | "The `redirect_uri` must use HTTPS." |
| Redirect may be a subdirectory of a configured URL | same | "Your `redirect_uri` must match or be a subdirectory of a Redirect URL configured under **App Management**." |
| `scope` requests bot scopes; `user_scope` requests user token scopes | same | "The `scope` list requests scopes for your app's bot user." |
| Undistributed apps live on one workspace | docs.slack.dev/app-management/distribution | "Undistributed apps exist on a single workspace" |
| Only Marketplace apps are described as reviewed | same | "apps listed in the Slack Marketplace are reviewed against our requirements & guidelines" |
| Marketplace needs 10+ active workspaces before submission | docs.slack.dev/slack-marketplace/slack-marketplace-review-guide | "Your app has been installed on 10 or more active workspaces." |
| Marketplace preliminary review | same | "the preliminary part of the review takes up to 10 business days to receive feedback." |
| Marketplace functional review | same | "the functional review takes up to 10 weeks for new submissions and 6 weeks for published apps resubmitting changes." |
| Workspace owners can require app approval | slack.com/help/articles/222386767-Manage-app-approval-for-your-workspace | "Workspace owners can enable app approval to pre-approve and restrict certain apps for their workspace:" |
| Token rotation cannot be turned off; tokens then expire every 12 hours | docs.slack.dev/authentication/using-token-rotation | "Token rotation may not be turned off once it's turned on" |
| Non-Marketplace commercially distributed apps: conversations.history / replies limited to 1 request a minute, 15 objects | docs.slack.dev/changelog/2025/05/29/rate-limit-changes-for-non-marketplace-apps | "The new rate limits will be updated to allow 1 request per minute and will return a maximum of 15 objects per request." |
| Internal customer-built apps keep existing limits | docs.slack.dev/changelog/2025/06/03/rate-limits-clarity/ | "Any internal customer-built apps will maintain their existing rate limits and will not be subject to the new posted limits." |

## Shopify

| Fact | Source | Quote |
|---|---|---|
| Apps are built in the Dev Dashboard or with Shopify CLI | shopify.dev/docs/apps/build/dev-dashboard | "The Dev Dashboard is where you build on Shopify." |
| Distribution is still in the Partner Dashboard | same | "Distribution is still in the Partner Dashboard." |
| Client ID and secret live only in the Dev Dashboard | same | "A few settings live only here, not in your `shopify.app.toml`," |
| Redirect URI must exactly match an allowlisted one | shopify.dev/docs/apps/build/authentication-authorization/access-tokens/authorization-code-grant | "Must exactly match a redirect URI you've configured in the Dev Dashboard or your app's configuration TOML file." |
| Scopes are declared in `shopify.app.toml` and approved at install | shopify.dev/docs/apps/build/cli-for-apps/app-configuration | "they're prompted to grant permission to all the access scopes that you defined in this field." |
| CLI apps use Shopify managed installation by default | shopify.dev/docs/apps/build/authentication-authorization | "Apps built with Shopify CLI use managed installation by default." |
| Public distribution needs approval and App Store registration with a one-time fee (amount not stated) | shopify.dev/docs/apps/launch/distribution | "Public distribution also requires registering for the Shopify App Store, which has a one-time fee." |
| Custom distribution: one store or one Plus organization, no review | same | "Installed on a single Shopify store, on multiple stores that belong to the same Plus organization" |
| Distribution method cannot be changed | same | "You can't change the distribution method after you select it." |
| Legacy admin-created custom apps cannot be created from 1 Jan 2026 | shopify.dev/changelog/posts/legacy-custom-apps-can-t-be-created-after-january-1-2026 | "Starting January 1, 2026, you can no longer create new custom apps in the Shopify admin." |
| Protected customer data access is requested in the Partner Dashboard and reviewed | shopify.dev/docs/apps/launch/protected-customer-data | "Public apps request access to protected customer data and protected customer fields through the Partner Dashboard." |
| App must be tested on a development store before submission | shopify.dev/docs/apps/launch/app-store-review/review-process | "you need to test it on a development store to check for any bugs or errors." |

## Assumptions that turned out wrong or outdated

These are places where the starting expectation (mine, from general knowledge) did not survive
reading the current docs.

1. **GitHub OAuth apps allow up to 10 callback URLs.** The familiar rule "OAuth apps get one callback URL, GitHub Apps get ten" is outdated.
2. **GitHub now has a wildcard-matching toggle for callback URLs.** Subdirectory matching is no longer the unconditional behaviour; exact match applies when the toggle is off.
3. **GitHub OAuth apps can issue expiring user tokens.** This used to be a GitHub App-only feature.
4. **Google's "OAuth consent screen" is now "Google Auth platform"** with Branding, Audience, Data Access and Clients pages. Step-by-step guides that name the old menu are stale.
5. **Google client secrets are viewable once.** Afterwards the console shows only the last characters.
6. **`gmail.metadata` is a Restricted scope**, not a sensitive one. `gmail.send` is the only general-purpose Gmail scope in the Sensitive tier.
7. **Slack publishes Marketplace review timelines** (up to 10 business days preliminary, up to 10 weeks functional). I expected no published number.
8. **Shopify app creation moved to the Dev Dashboard.** The Partner Dashboard is now for distribution and protected-data requests.

## Could not confirm

- Google: any cost figure for the CASA security assessment, or who pays. No number on the pages read.
- Google: the "Advanced > Go to app (unsafe)" click-through on the unverified-app screen.
- GitHub: an explicit sentence saying no review is needed before other users authorize an OAuth app. The docs simply describe no review step.
- GitHub: whether org OAuth app access restrictions also apply to GitHub Apps.
- Slack: an explicit statement that "Activate Public Distribution" needs no Slack review.
- Slack: dates on which existing non-Marketplace installs become subject to the new rate limits. A search snippet claimed 3 Mar 2026; the fetched changelog pages do not contain that date and say existing installs are not impacted.
- Shopify: any officially published App Store review timeline. None on four official pages.
- Shopify: the amount of the one-time App Store registration fee.

## Pages that failed or were incomplete

- `shopify.dev/changelog/legacy-custom-apps-cant-be-created-after-january-1-2026` returned 404 (guessed URL); the correct path has `/posts/` and `can-t`.
- `api.slack.com/methods/conversations.history` and the api.slack.com changelog URL redirect to docs.slack.dev.
- `help.shopify.com/en/partners/dashboard/managing-apps` loaded only as a navigation index.
- `developers.google.com/identity/protocols/oauth2/web-server` was read for the first 100,000 of 113,437 characters.
- `support.google.com/cloud/answer/13464325` and `/13463073` were truncated by the fetcher.
