/**
 * Manual evidence audit of the four saved guides, 11 Nov 2026.
 *
 * Every verified claim was read against the page it cites (retrieved again on the audit date). A quote
 * that only appears on the page is not enough: it has to support the whole claim. This script applies
 * the resulting corrections and records each one in validation.adjustments with the prefix
 * "manual audit 2026-11-11". It adds one source (Shopify's Dev Dashboard page), retrieved on the audit
 * date and labelled as added during the audit; no pipeline run is claimed for it.
 *
 * After applying the corrections it re-retrieves every cited page and checks every verified quote with
 * the same matcher the pipeline uses. It refuses to write if any verified quote is missing.
 *
 *   npx tsx scripts/audit-2026-11-11.ts            # dry run: apply in memory and check quotes
 *   npx tsx scripts/audit-2026-11-11.ts --write    # also write data/guides/*.json
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { GUIDES_DIR } from "../server/app.ts";
import { classifySource } from "../server/authority.ts";
import { fetchPage } from "../server/fetchPage.ts";
import { quoteFound } from "../server/verify.ts";
import { GuideSchema, eachClaim, type Claim, type Guide } from "../shared/schema.ts";

const WRITE = process.argv.includes("--write");
const TAG = "manual audit 2026-11-11";
type Status = Claim["status"];

function claimAt(g: Guide, p: string): Claim {
  let found: Claim | null = null;
  eachClaim(g, (c, cp) => {
    if (cp === p) found = c;
  });
  if (!found) throw new Error(`no claim at ${p}`);
  return found;
}

function note(g: Guide, p: string, change: string, reason: string) {
  g.validation.adjustments.push({ path: p, change: `${TAG}: ${change}`, reason });
}

/** Rewrite a claim (and, for steps, its other fields). Records old status → new status. */
function fix(g: Guide, p: string, patch: Partial<Claim> & Record<string, unknown>, reason: string) {
  const c = claimAt(g, p) as Claim & Record<string, unknown>;
  const before: Status = c.status;
  Object.assign(c, patch);
  if (c.status !== "verified") c.quote = patch.quote ?? null;
  note(g, p, before === c.status ? `${c.status}, rewritten` : `${before} → ${c.status}`, reason);
}

function add<T extends object>(g: Guide, list: T[], listPath: string, item: T, reason: string) {
  list.push(item);
  note(g, `${listPath}[${list.length - 1}]`, "added", reason);
}

/** Insert a step and shift recorded paths of later steps so earlier adjustments still point at the right step. */
function insertStep(g: Guide, index: number, step: Guide["steps"][number], reason: string) {
  const shift = (p: string) => p.replace(/^steps\[(\d+)\]/, (m, n) => (Number(n) >= index ? `steps[${Number(n) + 1}]` : m));
  for (const a of g.validation.adjustments) a.path = shift(a.path);
  g.validation.thirdPartyOnly = g.validation.thirdPartyOnly.map(shift);
  g.steps.splice(index, 0, step);
  note(g, `steps[${index}]`, "added", reason);
}

const v = (sourceIds: string[], quote: string) => ({ status: "verified" as const, sourceIds, quote });

const audits: Record<string, (g: Guide) => Promise<void> | void> = {
  async shopify(g) {
    const url = "https://shopify.dev/docs/apps/build/dev-dashboard";
    const page = await fetchPage(url);
    if (!page.ok) throw new Error(`could not retrieve ${url}: ${page.reason}`);
    g.sources.push({
      id: "S8",
      url,
      title: `${page.title} (added during the ${TAG})`,
      kind: "provider_page",
      authority: classifySource(url, "Shopify", "shopify"),
      retrievedAt: new Date().toISOString(),
      chars: page.chars,
      truncated: page.truncated,
    });
    note(g, "sources[S8]", "added", "Retrieved during the audit to check the Partner-account prerequisite. Not part of the original pipeline run.");

    fix(g, "authMethod", {
      text: "Apps that run outside the Shopify admin use the authorization code grant: the merchant is redirected to Shopify to approve access, then back to the app with a code that the app exchanges for an access token.",
      ...v(["S4"], "for apps that run outside the Shopify admin. The merchant is redirected to Shopify to approve access, then back to your app with a code that your app exchanges for an access token."),
    }, "The previous quote was Composio's description of the toolkit and did not mention any grant type.");

    fix(g, "externalReview.summary", {
      text: "Apps submitted to the Shopify App Store are reviewed by the Shopify app review team before approval.",
      ...v(["S5"], "If you've followed all of the requirements to create your app, then you're ready to submit your app for review by the Shopify app review team."),
    }, "The previous quote only said to test before submitting; it did not say a review is mandatory, and the claim said 'public apps' where the page covers App Store submissions.");
    fix(g, "externalReview.triggers[0]", {
      text: "Submitting the app for a Shopify App Store listing.",
      ...v(["S5"], "If you've followed all of the requirements to create your app, then you're ready to submit your app for review by the Shopify app review team."),
    }, "Narrowed from 'distributing publicly' to App Store submission, which is what the page covers.");
    fix(g, "externalReview.triggers[1]", {
      text: "Apps that use customer data must meet Shopify's protected customer data requirements and apply for access in the Partner Dashboard (API access requests > Protected customer data access).",
      ...v(["S5"], "If your app uses customer data, then you need to meet the protected customer data requirements … and then apply for access to this data in the API access requests > Protected customer data access section of your Partner Dashboard."),
    }, "The cited page states this directly; upgraded with the quote.");

    fix(g, "prerequisites[0]", {
      text: "A Partner organization isn't needed to use the Dev Dashboard: merchants, and developers building for their company's own stores, open it from the Shopify admin. Apps created there are custom apps for that organization's stores.",
      ...v(["S8"], "You don't need a Partner organization to use the Dev Dashboard. If you're a merchant, or a developer building for your company's own stores, then open it from the Shopify admin. … Apps that you create there are custom apps"),
    }, "Wrong: the claim said a Partner account is required for the Dev Dashboard, supported only by the quote 'Log in to your Dev Dashboard'. Shopify's Dev Dashboard page says a Partner organization isn't needed.");
    add(g, g.prerequisites, "prerequisites", {
      kind: "account",
      text: "Distribution to the Shopify App Store is still handled in the Partner Dashboard, so listing the app publicly goes through a Partner organization.",
      ...v(["S8"], "To list your app on the Shopify App Store, refer to About distribution … Distribution is still in the Partner Dashboard."),
    }, "Keeps the part of the old claim that holds: App Store distribution, not app creation, needs the Partner Dashboard.");
    fix(g, "prerequisites[1]", {
      text: "A development store to test the app on; if you don't have one, you can create one.",
      ...v(["S5"], "Development stores can be used to test apps to ensure they're free of bugs or otherwise incomplete. If you don’t have a development store, then you can create one"),
    }, "The claim said a development store is 'needed' for OAuth and billing tests; the page says development stores 'can be used' to test.");

    fix(g, "redirectRules[0]", {
      text: "Before submitting, the app's App URL and allowed redirection URL must send merchants to the OAuth grant screen as expected.",
      ...v(["S5"], "Before submitting your app, make sure its App URL and allowed redirection URL redirect merchants to the OAuth screen as expected."),
    }, "The quote 'Check your app URL and your redirect URLs' did not support 'must be configured in the Dev Dashboard or app configuration file'.");
    fix(g, "scopes.model", {
      text: "An access scope is a named unit of access that a merchant grants the app, such as read_products or write_orders.",
      ...v(["S4"], "A named unit of access that a merchant grants your app, such as read_products or write_orders."),
    }, "Reworded to say only what the quote says.");

    fix(g, "steps[0]", {
      title: "Open the Dev Dashboard in the right organization",
      action: "For an app used only on your own company's stores, open the Dev Dashboard from the Shopify admin (click your store name, then View Dev Dashboard). To list the app on the Shopify App Store, work in a Partner organization, because distribution is in the Partner Dashboard.",
      where: "Shopify admin, or a Partner organization",
      text: "Merchants and developers building for their company's own stores open the Dev Dashboard from the Shopify admin; no Partner organization is needed.",
      ...v(["S8"], "You don't need a Partner organization to use the Dev Dashboard. If you're a merchant, or a developer building for your company's own stores, then open it from the Shopify admin."),
    }, "Replaces 'Create a Shopify Partner Account', which contradicted Shopify's Dev Dashboard documentation.");
    fix(g, "steps[1]", {
      title: "Create the app in the Dev Dashboard",
      action: "In the Dev Dashboard, create the app. Shopify suggests this path (rather than Shopify CLI) for automation or API-only apps with no UI in the Shopify admin.",
      text: "The Dev Dashboard is the path Shopify suggests for automation or API-only apps with no UI in the Shopify admin.",
      ...v(["S8"], "Best for automation or API-only apps with no UI in the Shopify admin."),
    }, "The previous quote described opening an existing app's overview page, not creating an app.");
    fix(g, "steps[2]", {
      title: "Check the app URL and redirect URLs",
      action: "In the Dev Dashboard, open Apps, your app, Versions, then the active version, and check the app URL and redirect URLs. The Composio redirect URI is added in a later step.",
    }, "Title no longer mentions scopes, which the quote does not cover.");
    fix(g, "steps[7]", {
      text: "Once the app meets all requirements, submit it for review by the Shopify app review team.",
      ...v(["S5"], "If you've followed all of the requirements to create your app, then you're ready to submit your app for review by the Shopify app review team."),
    }, "The previous quote was the four-word fragment 'submit your app for approval'.");

    fix(g, "risks[0]", {
      kind: "blocker",
      text: "New public apps can't use non-expiring offline access tokens for GraphQL Admin API requests, so the integration must handle expiring offline tokens and refresh them.",
      ...v(["S6"], "Non-expiring offline tokens grant permanent access until the app is uninstalled or the secret is revoked. New public apps already can't use them for GraphQL Admin API requests."),
    }, "The old claim cited the 2027 cut-off dates but dropped two qualifications: new public apps already can't use non-expiring tokens, and the dates don't apply to custom or merchant-created apps.");
    add(g, g.risks, "risks", {
      kind: "limit",
      text: "Existing public apps that still use non-expiring offline tokens are delisted and blocked from new installs on 1 January 2027, and their Admin API requests are rejected from 1 April 2027. This doesn't apply to custom apps or apps created by merchants.",
      ...v(["S6"], "Public apps that still use non-expiring offline access tokens are delisted and blocked from new installs on January 1, 2027. Their GraphQL Admin API and REST Admin API requests are rejected from April 1, 2027. This doesn't apply to custom apps or apps created by merchants."),
    }, "Split from risks[0] with the exemption the old claim left out.");
    fix(g, "risks[1]", {
      text: "Apps that are incomplete or have errors that prevent Shopify from reviewing their features won't be approved.",
      ...v(["S5"], "If you submit an app that is incomplete or has errors that prevent us from reviewing its features, then it won't be approved."),
    }, "The old claim added 'broken billing' as a rejection cause requiring resubmission; Shopify's own table says billing problems do not require a re-submit.");
    add(g, g.risks, "risks", {
      kind: "review",
      text: "Re-submitting the app slows down the review process.",
      ...v(["S5"], "Resubmitting your app slows down the review process."),
    }, "Stated on the cited page.");

    g.difficulty.rationale = "Needs client credentials, scope choices, a development store for testing, expiring offline tokens for public apps, and Shopify App Store review if the app is listed publicly.";
    note(g, "difficulty.rationale", "rewritten", "No longer assumes billing integration (only relevant to paid apps) or that every app is publicly reviewed.");
    g.handsOnEffort.basis = "Assumes an existing Shopify store or Partner organization, creating the app in the Dev Dashboard, setting scopes and redirect URLs, and entering the credentials into Composio. Excludes App Store review time.";
    note(g, "handsOnEffort.basis", "rewritten", "No longer assumes creating a Partner account.");
    g.division.humanOnly = g.division.humanOnly.map((x) => (/Partner account/i.test(x) ? "Choosing the organization (your own store's admin, or a Partner organization for App Store distribution)" : x));
    g.nextActions = [
      "Decide whether the app will only be used on stores your organization owns (custom app from the Shopify admin) or listed on the Shopify App Store (Partner organization).",
      "Create the app in the Dev Dashboard and copy its client ID and client secret.",
      "Create a custom auth config in Composio and add its redirect URI to the app's allowed redirection URLs.",
      "Use expiring offline access tokens if the app is public.",
    ];
    g.unresolved = [
      "Shopify's review turnaround time was not found in the retrieved pages.",
      "If your users connect stores your organization doesn't own, a custom app made in your own organization may not be enough; Shopify's About distribution page, which explains distribution types, was not retrieved.",
      "Whether custom apps made for your own stores go through any review is not stated in the retrieved pages.",
    ];
    note(g, "nextActions, unresolved, division", "rewritten", "Removed the Partner-account requirement and added the distribution question it hid.");
  },

  github(g) {
    fix(g, "steps[0]", {
      title: "Decide: Composio-managed app or your own",
      text: "Composio can provide the OAuth app that your users authorize when they connect a toolkit.",
    }, "The old text also claimed custom configs exist 'for custom branding or specific scopes', which the quote does not say.");
    fix(g, "steps[1]", {
      text: "In Settings, click Developer settings in the left sidebar, then OAuth apps.",
      quote: "In the left sidebar, click Developer settings. 3. In the left sidebar, click OAuth apps.",
    }, "Quote extended to cover the OAuth apps click as well.");
    fix(g, "steps[2]", {
      text: "Enter the application name and the full URL of your app's website.",
      quote: 'In "Application name", type the name of your app. … In "Homepage URL", type the full URL to your app\'s website.',
    }, "The old quote covered only the application name, not the homepage URL.");
    fix(g, "steps[3]", {
      text: "In Authorization callback URL, enter your app's callback URL; up to 10 callback URLs can be added.",
      quote: 'In "Authorization callback URL", type the callback URL of your app. You can enter up to 10 callback URLs.',
    }, "The old text said the callback URL is 'provided by Composio'; GitHub's page says only 'the callback URL of your app'. The Composio part stays in the action, where step 6 of the Composio flow supplies it.");
    fix(g, "steps[4]", {
      title: "Register the app and get its credentials",
      action: "Click Register application. Then copy the Client ID and generate a client secret on the app's page (the retrieved GitHub pages describe registering the app, not generating the secret).",
      text: "Finish by clicking Register application.",
      quote: "Click Register application.",
    }, "The old text also claimed the page explains copying the Client ID and generating a secret; it does not.");
    fix(g, "risks[1]", {
      text: "When the app uses expiring tokens, access tokens expire after eight hours and refresh tokens after six months without use.",
    }, "Reworded; the quote is unchanged and supports it.");
    add(g, g.risks, "risks", {
      kind: "security",
      text: "Expiring user access tokens are enabled by default when you create an OAuth app; unchecking the box is only advised until the app's authentication code supports short-lived tokens.",
      ...v(["S4"], "Expire user access tokens is enabled by default. If your app's authentication code hasn't been updated to support short-lived tokens, uncheck the box until support is added."),
    }, "Stated on the retrieved creation page and missed by the pipeline.");
    g.unresolved = [
      ...g.unresolved,
      "Organizations can restrict which OAuth apps may access their data; whether target organizations need an owner to approve the app was not checked in this investigation.",
      "Whether Composio's custom auth config refreshes GitHub's expiring user tokens was not checked.",
    ];
    note(g, "unresolved", "added", "Two launch questions the audit found that the retrieved pages do not answer.");
  },

  gmail(g) {
    fix(g, "authMethod", {
      text: "The app uses an OAuth client to get access tokens from Google's OAuth 2.0 endpoint; creating the client gives a client ID and, for some client types, a client secret.",
      ...v(["S7"], "Your OAuth client is the credential which your application uses when making calls to Google OAuth 2.0 endpoint to receive an access token or ID token. After creating your OAuth client, you will receive a client ID and sometimes, a client secret."),
    }, "The old quote was a generic description of OAuth 2.0 that said nothing about client IDs, secrets or the authorization code flow.");
    fix(g, "externalReview.summary", {
      text: "Public apps that use scopes permitting access to certain user data must complete Google's verification process.",
    }, "The old text named sensitive and restricted scopes; the quote says 'certain user data'. The scope tiers are covered by the triggers.");
    fix(g, "scopes.model", {
      text: "Choose the most narrowly focused scope possible and avoid requesting scopes the app doesn't need.",
    }, "The old text also defined scopes, which the quote does not do.");
    g.externalReview.requirement = "conditional";
    note(g, "externalReview.requirement", "always → conditional", "Google's pages say verification applies to public apps using certain scopes, and that apps in development, testing or staging are not subject to it. 'Always' was not supported.");
    fix(g, "externalReview.triggers[0]", {
      text: "Requesting sensitive scopes, which give access to specific Google user data and need additional OAuth app verification.",
      ...v(["S4"], "These scopes provide access to specific Google user data that users authorize for your app. They require additional"),
    }, "The cited Gmail scopes page states this; upgraded with the quote.");
    add(g, g.externalReview.triggers, "externalReview.triggers", {
      text: "Requesting restricted scopes (for example gmail.readonly), which need scope verification before they can be requested from any Google Account. Storing or transmitting restricted scope data on servers also needs a security assessment.",
      ...v(["S5"], "These scopes provide wide access to Google user data and require you to go through a scope verification process before you request the scopes from any Google Account. … If you store or transmit restricted scope data on servers, then you need to complete a"),
    }, "Restricted scopes are the main trigger for Gmail and were missing as a separate trigger.");
    fix(g, "prerequisites[0]", {
      status: "inferred",
      sourceIds: ["S6"],
      quote: null,
    }, "The quote ('To run any of the code samples in this document, you'll need a Google Account') is about running Google's code samples, not about creating the OAuth app.");
    fix(g, "prerequisites[1]", {
      text: "The Gmail API must be enabled for the project; any application that calls Google APIs needs to enable them in the API Console.",
    }, "Reworded so the project requirement is not stated as a separate fact.");
    fix(g, "steps[0]", {
      text: "Select an existing Google Cloud project or create a new one.",
    }, "The old text added 'to host your OAuth credentials and enable APIs', which the quote does not say.");
    fix(g, "steps[2]", {
      text: "On the Branding page, provide the app's name, logo, developer contact information and relevant links.",
    }, "The old text added 'before creating credentials', which the quote does not say.");
    fix(g, "steps[3]", {
      text: "Click Create client, choose the application type, and enter the required information.",
      quote: "Click CREATE CLIENT 3. Select the appropriate application type for your application and enter any additional information required.",
    }, "The old quote was the two-word fragment 'Click CREATE CLIENT'.");
    fix(g, "steps[4]", {
      text: "Create the auth config in the Composio dashboard and enter the required credential fields.",
      ...v(["S3"], "1. Click Create Auth Config 2. Select the toolkit 3. Choose the auth scheme (OAuth2, API Key, Bearer Token, etc.) 4. Follow the dashboard instructions for the required credential fields"),
    }, "Composio's page states the steps; upgraded with the quote.");
    fix(g, "risks[0]", {
      text: "Restricted-scope verification can take several weeks.",
    }, "The old claim said sensitive scopes take weeks too; the quote is about restricted scopes only.");
    fix(g, "risks[1]", {
      text: "Don't store the downloaded client_secret.json file in a publicly accessible location.",
    }, "The old claim ('never hardcode client secrets in source control') said more than the quote.");
    add(g, g.risks, "risks", {
      kind: "security",
      text: "The client secret is shown only after you create the client; store it in a secure place.",
      ...v(["S7"], "Your application's client secret will only be shown after you create the client. Store this information in a secure place"),
    }, "Stated on the retrieved page.");
    add(g, g.risks, "risks", {
      kind: "limit",
      text: "Apps in development, testing or staging are not subject to verification, but they show the unverified-app screen and are capped at 100 users until verified.",
      ...v(["S8"], "Apps in development/testing/staging mode are not subject to verification. … Your app will be subject to the unverified app screen and the 100-user cap will be in effect when an app is in development/testing/staging."),
    }, "Stated on the retrieved page and needed to explain why review is conditional.");
    const tiers: Record<string, string> = {
      "https://www.googleapis.com/auth/gmail.readonly": "Restricted",
      "https://www.googleapis.com/auth/gmail.send": "Sensitive",
      "https://www.googleapis.com/auth/gmail.labels": "Non-sensitive",
    };
    for (const e of g.scopes.examples) if (tiers[e.scope] && e.tier !== tiers[e.scope]) throw new Error(`tier mismatch for ${e.scope}`);
  },

  slack(g) {
    fix(g, "authMethod", {
      text: "Slack apps are installed with a v2 OAuth 2.0 flow.",
    }, "The old text also described bot and user scopes and the code exchange; the quote only names the flow.");
    fix(g, "externalReview.summary", {
      text: "Apps listed in the Slack Marketplace are reviewed against Slack's requirements and guidelines; unlisted distributed apps are not.",
      quote: "Unlike unlisted distributed apps, apps listed in the Slack Marketplace are reviewed against our requirements & guidelines",
    }, "The old quote did not cover the claim that unlisted or single-workspace apps need no review; this one covers unlisted apps.");
    fix(g, "externalReview.triggers[0]", {
      text: "Submitting the app for a Slack Marketplace listing, which Slack recommends for apps intended for commercial distribution.",
    }, "Reworded to match the quote's 'should', not a requirement.");
    fix(g, "prerequisites[0]", {
      text: "A Slack workspace to develop in; Slack recommends setting up a developer sandbox if you don't have one.",
    }, "The old text said a Slack account and workspace are required; the quote is a recommendation for when you have no workspace.");
    fix(g, "redirectRules[0]", {
      text: "The redirect_uri, and any Redirect URL configured under OAuth & Permissions, must use HTTPS.",
      quote: "The redirect_uri must use HTTPS. Alternatively, you can configure a Redirect URL in the App Management page under OAuth & Permissions. A Redirect URL must also use HTTPS.",
    }, "Split: the subdirectory and anchor rules were not in the quote.");
    add(g, g.redirectRules, "redirectRules", {
      text: "The redirect_uri must match or be a subdirectory of a Redirect URL configured under App Management, and a Redirect URL can't contain an anchor (#).",
      ...v(["S4"], "Your redirect_uri must match or be a subdirectory of a Redirect URL configured under App Management. A Redirect URL can not contain an anchor (#)."),
    }, "Split from redirectRules[0] with its own quote.");
    fix(g, "steps[0]", {
      text: "Create the Slack app; a new app resides in one workspace until you distribute it, listed or unlisted.",
      quote: "When you create a Slack app, it resides in one workspace. You can also distribute Slack apps in either listed or unlisted fashion.",
      sourceIds: ["S6"],
    }, "The old quote was the fragment 'App Management page'.");
    fix(g, "steps[2]", {
      text: "Configure a Redirect URL in the App Management page under OAuth & Permissions.",
    }, "The old text added 'over HTTPS', which this quote does not cover (redirectRules[0] does).");
    fix(g, "steps[3]", {
      text: "Create the auth config in the Composio dashboard and enter the required credential fields.",
      ...v(["S3"], "1. Click Create Auth Config 2. Select the toolkit 3. Choose the auth scheme (OAuth2, API Key, Bearer Token, etc.) 4. Follow the dashboard instructions for the required credential fields"),
    }, "Composio's page states the steps; upgraded with the quote.");
    fix(g, "steps[5]", {
      status: "inferred",
      quote: null,
    }, "The quote describes the OAuth flow in general; it does not say to test the connection. Testing is a sensible step, so it stays, labelled inferred.");
    insertStep(g, 5, {
      title: "Activate public distribution",
      action: "In the app's dashboard, scroll to Share Your App with Other Workspaces under Manage Distribution, complete the checklist, and click Activate Public Distribution. Without this, only the app's own workspace can install it.",
      where: "Slack app dashboard, Manage Distribution",
      link: null,
      linkSeenInSources: false,
      actor: "human_only",
      actorReason: "Changing an app's distribution is a console action taken by the app's owner.",
      text: "To let other workspaces install the app, complete the checklist under Share Your App with Other Workspaces and click Activate Public Distribution.",
      ...v(["S6"], "Scroll to Share Your App with Other Workspaces within the Manage Distribution section. 3. Ensure all items in the supplied checklist are completed. 4. Click Activate Public Distribution."),
    }, "Missing step: Composio users connect their own workspaces, which needs distribution turned on. Stated on the retrieved distribution page.");
    fix(g, "risks[0]", {
      text: "Some workspaces only let admins authorize app installs, some only allow apps listed in the Slack Marketplace, and some require admin approval before an install.",
      ...v(["S6"], "Some workspaces will restrict app installation so that only workspace administrators can provide authorization. Other workspaces may only allow the installation of apps officially listed in the Slack Marketplace. … Workspaces can also enable admin approval"),
    }, "The old quote was a sentence fragment from Composio's page; Slack's own distribution page states all three restrictions.");
    g.division.humanOnly = [...g.division.humanOnly, "Activating public distribution so other workspaces can install the app."];
    note(g, "division.humanOnly", "added", "Follows the added step.");
  },
};

const pageCache = new Map<string, Promise<string | null>>();
const pageText = (url: string) => {
  if (!pageCache.has(url)) pageCache.set(url, fetchPage(url).then((p) => (p.ok ? p.text : null)));
  return pageCache.get(url)!;
};
const resolved = new Map<string, string | null>();

let problems = 0;
for (const slug of Object.keys(audits)) {
  const file = path.join(GUIDES_DIR, `${slug}.json`);
  const g = GuideSchema.parse(JSON.parse(await readFile(file, "utf8")));
  if (g.validation.adjustments.some((a) => a.change.startsWith(TAG))) {
    console.log(`${slug}: already audited, skipping`);
    continue;
  }
  await audits[slug](g);

  const byId = new Map(g.sources.map((s) => [s.id, s]));
  const counts = { verified: 0, inferred: 0, unknown: 0 };
  const checks: Promise<void>[] = [];
  eachClaim(g, (c, p) => {
    counts[c.status]++;
    if (c.status !== "verified") return;
    checks.push(
      (async () => {
        const urls = c.sourceIds.map((id) => byId.get(id)?.url).filter(Boolean) as string[];
        let ok = false;
        for (const u of urls) {
          const text = await pageText(u);
          resolved.set(u, text);
          if (text && c.quote && quoteFound(c.quote, text)) ok = true;
        }
        if (!ok) {
          problems++;
          console.log(`  QUOTE NOT FOUND ${slug} ${p} (${urls.map((u) => `${u}: ${resolved.get(u)?.length ?? "not retrieved"} chars`).join("; ")}): ${c.quote}`);
        }
      })(),
    );
  });
  await Promise.all(checks);
  g.validation.counts = counts;
  g.validation.officialPagesRead = g.sources.filter((s) => s.authority === "official").length;
  GuideSchema.parse(g);
  console.log(`${slug}: ${counts.verified} verified, ${counts.inferred} inferred, ${counts.unknown} unknown; ${g.validation.adjustments.filter((a) => a.change.startsWith(TAG)).length} audit adjustments`);
  if (WRITE && !problems) await writeFile(file, JSON.stringify(g, null, 2) + "\n");
}
if (problems) {
  console.log(`${problems} verified quotes were not found; nothing written.`);
  process.exit(1);
}
console.log(WRITE ? "written" : "dry run: nothing written");
