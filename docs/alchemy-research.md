# Alchemy deployment research

Checked on 1 October 2026 against official documentation, npm metadata, and the installed package source.

## Version decision

The main docs describe Effect-based Alchemy v2 and link to an [LLM documentation index](https://alchemy.run/llms.txt). The latest npm release was `2.0.0-beta.79`. Its peer dependencies permit Effect 4, but its CLI imports `effect/unstable/cli/Command`, which this project's `effect@4.0.0` no longer exports. Running `bun alchemy --help` failed with that missing-module error. This is a verified runtime incompatibility, despite the declared peer range. [Official v2 docs](https://alchemy.run/getting-started/), [upstream package source](https://github.com/alchemy-run/alchemy/blob/main/packages/alchemy/package.json).

Pin `alchemy@0.94.0`, the latest release using Alchemy's v1 API. It runs as an async infrastructure script and leaves the server on Effect 4. Its CLI started successfully. Wrangler is pinned to `4.103.0`: npm's selected `4.146.0` archive returned 404 during installation. Version `4.103.0` installed and bundled the Worker successfully. Use the [official v1 docs](https://v1.alchemy.run/) for this configuration.

## Infrastructure and state

`alchemy.run.ts` defines one `Worker` with a public `workers.dev` URL and an entrypoint at `apps/server-mcp/src/worker.ts`. Alchemy bundles and deploys that module. The production stage is explicit in `bun run deploy`. Local development uses a separate development stage. [Official Worker guide](https://v1.alchemy.run/guides/cloudflare-worker/).

Keep local deployment state in ignored `.alchemy/` for the first deployment. Retain it between runs; use shared state before CI or multiple deployers. [Official state documentation](https://v1.alchemy.run/concepts/state/).

## MCP transport

The Bun entry listens on a port; the Worker exports a fetch handler built with `HttpRouter.toWebHandler`. Both entries share the capabilities layer. The Worker initializes the handler inside the first request so Effect resource acquisition happens in Cloudflare's request context.

The existing MCP `2025-06-18` adapter maintains sessions in memory. Cloudflare can route later requests to another isolate. The Worker therefore uses the installed stateless `McpProtocol.v2026_07_28` adapter. It requires compatible clients and per-request version/capability metadata. This is not compatibility with older session-based MCP clients. Source evidence: installed `effect/src/ai/McpProtocol.ts`, `effect/src/ai/internal/mcpRuntime.ts`, and `effect/src/http/HttpRouter.ts`.

## Credentials

For this pinned v1 release, run `bun alchemy configure` and choose Cloudflare OAuth. Refresh later with `bun alchemy login cloudflare`. The v2 `profile edit` command does not apply. API-token authentication uses `CLOUDFLARE_API_TOKEN` and an optional explicit `CLOUDFLARE_ACCOUNT_ID`. [Official Cloudflare authentication guide](https://v1.alchemy.run/guides/cloudflare/).

This stack uses only an account Worker and its `workers.dev` endpoint. Start with account-scoped Workers Scripts edit and Account Settings read permissions for a token. It has no DNS routes, storage bindings, or remote-state bootstrap resources. Confirm the account and permissions during the first authenticated deployment.

## Validation

- Frozen-lockfile installation, server build, and server/infrastructure type checking passed.
- Lint and formatting checks passed.
- Wrangler dry-run bundled the Worker without deploying it.
- Cloudflare's local runtime returned 200 for discovery, tools/list, and resources/list.
- Local origin admission returned 200 for the configured origin and 403 for an untrusted origin.
- Missing MCP routing headers returned 400; GET /mcp returned 405; an unknown route returned 404.

`bun run dev:worker` loaded the Alchemy configuration and then stopped at the missing Cloudflare credentials error. The offline Wrangler command works without credentials. Cloudflare authentication and deployment remain unperformed. The endpoint has no application authentication, and the capability layer remains empty.
