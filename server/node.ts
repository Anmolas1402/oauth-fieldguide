import "dotenv/config";
import { config } from "dotenv";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createApp } from "./app.ts";
import { hasModelCredentials, modelName } from "./model.ts";

// .env.local (gitignored) takes precedence over .env for local development.
config({ path: ".env.local", override: true, quiet: true });

const app = createApp();

// In production the same process serves the built client from dist/.
if (existsSync("dist/index.html")) {
  app.use("/*", serveStatic({ root: "./dist" }));
  app.get("*", async (c) => c.html(await readFile("dist/index.html", "utf8")));
}

// In dev the API has its own port (API_PORT) so that a PORT set for the Vite server is not taken by the API.
const port = Number(process.env.FIELDGUIDE_DEV ? (process.env.API_PORT ?? 8787) : (process.env.PORT ?? 8787));
serve({ fetch: app.fetch, port }, () => {
  console.log(`OAuth Fieldguide API listening on http://localhost:${port}`);
  console.log(
    hasModelCredentials()
      ? `Live research enabled (model: ${modelName()})`
      : "ANTHROPIC_API_KEY is not set: Composio lookups work, live research is disabled",
  );
});
