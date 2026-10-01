# Deploy the MCP server to Cloudflare

This Stack Effect project has a Bun server and a Cloudflare Worker entry. Both use `apps/server-mcp/src/capabilities.ts` for tools, prompts, and resources. The initial server has no registered tools or resources.

## Prepare the development environment

```sh
direnv allow
bun install --frozen-lockfile
bun run type-check
bun run lint
bun run format:check
```

The committed flake lock pins the Nix development environment. `direnv` loads Bun and Node when you enter the project directory.

## Run locally

For the original Bun server at `http://localhost:9009/mcp`, run:

```sh
bun run dev
```

For the Worker without Cloudflare credentials, run:

```sh
bun run dev:worker:offline
```

After configuring Cloudflare, `bun run dev:worker` runs Alchemy's development mode. Alchemy requires a Cloudflare profile even for this command.

The Bun entry supports MCP `2025-06-18`. The Worker supports stateless MCP `2026-07-28`. Use a client that supports that revision for the Worker. Older session-based clients need a separate stateful deployment design.

## Connect your Cloudflare account

Run this interactive command and select Cloudflare with OAuth:

```sh
bun alchemy configure
```

Complete the browser authorization and choose your Cloudflare account. Alchemy stores the profile outside this repository. To refresh the login later, run `bun alchemy login cloudflare`.

For API-token authentication instead, set `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` in your shell or an ignored `.env` file. Use an account-scoped token with Workers Scripts edit permission and Account Settings read permission. No zone or DNS permissions are needed for this `workers.dev` deployment. See [Alchemy's Cloudflare authentication guide](https://v1.alchemy.run/guides/cloudflare/).

## Deploy

After authentication, run:

```sh
bun run deploy
```

Alchemy creates the production Worker and prints `mcpUrl`. Connect your compatible MCP client to that URL.

The endpoint is public and has no application authentication. Requests without an `Origin` header are accepted. Browser origins are rejected by default. To permit specific origins, supply a comma-separated list at deployment:

```sh
MCP_ALLOWED_ORIGINS=http://localhost:3000 bun run deploy
```

Origin validation does not replace authentication. Add authentication before exposing tools that require private access.

Retain the ignored `.alchemy/` directory between deployments. It records the resources Alchemy owns. Set up shared remote state before adding CI or deploying from another machine. See [the deployment research](docs/alchemy-research.md) for the version choice and limits.

## Check a Worker request

Replace the URL with the local or deployed Worker URL:

```sh
curl http://localhost:9010/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H 'Mcp-Protocol-Version: 2026-07-28' \
  -H 'Mcp-Method: server/discover' \
  --data '{"jsonrpc":"2.0","id":1,"method":"server/discover","params":{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientCapabilities":{}}}}'
```

The response lists `2026-07-28` in `supportedVersions`. Follow the URL printed by Alchemy if its local port differs.
