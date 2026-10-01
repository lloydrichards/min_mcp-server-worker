# Effect MCP subscriptions on Cloudflare Workers

This repo reproduces [Effect issue #8651](https://github.com/Effect-TS/effect/issues/8651) and tests a candidate fix with a Bun patch.

An idle `subscriptions/listen` request sends its acknowledgement, then Cloudflare closes the stream almost immediately. Local workerd reports:

```text
The Workers runtime canceled this request because it detected that your Worker's code had hung and would never generate a response.
```

## What the tests show

The server uses `McpServer.layerHttp`, `McpProtocol.v2026_07_28`, and a `ping` tool. [The fixture](apps/server-mcp/test-fixtures/subscription-worker.ts) compares cached and per-request handlers, SSE heartbeats, and a timer that sends no bytes.

| Test                         | Observed behavior                                                    |
| ---------------------------- | -------------------------------------------------------------------- |
| Unpatched subscriptions      | Acknowledged, then closed within 36 to 72 ms                         |
| SSE heartbeat comments       | Stayed open for the full test                                        |
| Timer with no outgoing bytes | Also stayed open for the full test                                   |
| Effect transport patch       | Stayed open for 32 seconds locally and on Cloudflare; two heartbeats |

The timer-only result points to Cloudflare's event-loop liveness check. Effect waits for the next subscription notification without a pending timer or I/O event that can make progress. Caching the HTTP handler does not prevent the failure. See [the investigation and raw measurements](docs/subscriptions-cloudflare.md).

Tested with Effect `4.0.0`, Wrangler `4.103.0`, and compatibility date `2026-06-17`. Alchemy deploys the cloud Workers; the local reproduction uses Wrangler directly and needs no Cloudflare credentials.

## Reproduce the original failure

The baseline commit contains the fixture before the Effect patch. Use a separate checkout:

```sh
git clone https://github.com/lloydrichards/min_mcp-server-worker.git mcp-baseline
cd mcp-baseline
git switch --detach 007690f
bun install --frozen-lockfile
bun wrangler dev apps/server-mcp/test-fixtures/subscription-worker.ts --local --port 9011 --compatibility-date 2026-06-17
```

In another terminal, from that checkout, run:

```sh
python3 scripts/check-subscription.py 'http://localhost:9011/mcp?mode=cached'
```

Expect an acknowledgement followed by early EOF and the runtime error above. HTTP 200 and curl exit 0 do not mean the subscription stayed open. Repeat with `?mode=per-request` to test the handler construction from the original report.

## Test the candidate fix

`main` includes [a Bun patch](patches/effect@4.0.0.patch) that adds an SSE comment every 15 seconds to subscription responses:

```text
: keepalive

```

The timer starts before the subscription becomes idle. The comments add no JSON-RPC messages. The response stream owns the heartbeat's lifetime through `Stream.merge` with `haltStrategy: "left"`.

From a checkout of `main`, install dependencies and start the same fixture:

```sh
bun install --frozen-lockfile
bun wrangler dev apps/server-mcp/test-fixtures/subscription-worker.ts --local --port 9011 --compatibility-date 2026-06-17
```

Stop the baseline server first so port 9011 is free. In another terminal, run:

```sh
python3 scripts/check-subscription.py 'http://localhost:9011/mcp?mode=cached' --seconds 32 --expect-open --min-heartbeats 2
```

Expect two heartbeat comments, then curl exit 28 when the client ends the test at 32 seconds. The script fails if the server closes early or the heartbeats are absent.

The same patch passed on a separate Cloudflare test Worker. Ordinary ping calls still returned `pong`. The original production Worker was left unpatched for comparison. These bounded tests do not establish indefinite stability, timer cleanup in every termination case, or notification delivery across isolates. [Patch details and remaining tests](docs/effect-subscription-patch.md).

For cloud deployment and authentication, see [the deployment guide](docs/deploy.md).
