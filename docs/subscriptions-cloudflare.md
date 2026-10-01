# MCP subscriptions close on idle Cloudflare Workers

Verified on 1 October 2026 with this project's deployed Worker and Cloudflare's local workerd runtime. Effect is `4.0.0`, Alchemy is `0.94.0`, Wrangler is `4.103.0`, and the compatibility date is `2026-06-17`.

## Result

The report reproduces. `subscriptions/listen` sends its SSE acknowledgement, then closes without a final JSON-RPC result. Three requests to the deployed Worker ended after 0.072, 0.051, and 0.056 seconds. All returned curl exit 0, so HTTP 200 and a successful curl exit do not demonstrate a healthy subscription.

The live server has no registered tools and acknowledges an empty notification filter. A separate local fixture registers the screenshot's `ping` tool. It acknowledges `toolsListChanged: true`, emits the initial list-change notification, then fails in the same way.

The local runtime reports:

```text
The Workers runtime canceled this request because it detected that your Worker's code had hung and would never generate a response.
```

That exact runtime diagnostic was captured locally. The deployed observations establish early EOF; production logs were not inspected.

## Controls

The local fixture exposes four modes through the `mode` query parameter. Each uses the same Effect MCP layer and ping tool.

| Mode                         |  Elapsed | Outcome                                              |
| ---------------------------- | -------: | ---------------------------------------------------- |
| Cached handler, no heartbeat |  0.038 s | Acknowledgement, initial notification, premature EOF |
| New handler per request      |  0.036 s | Same premature EOF                                   |
| SSE comment every second     | 12.016 s | 11 heartbeat comments; client ended the test         |
| Timer every second, no bytes | 12.015 s | Stream remained open; client ended the test          |

The heartbeat and timer-only requests ended with curl exit 28 because the client imposed a 12-second deadline. That is the expected bounded-test outcome, not a server timeout. These controls do not prove indefinite stability, reconnection, notification delivery across isolates, or a production-ready fix.

The handler cache does not explain the reported failure. A native timer prevents the local failure even without outgoing bytes. This supports event-loop liveness as the immediate mechanism. Cloudflare documents that it detects requests waiting on unresolved promises when no events remain. Its HTTP-triggered Workers have no fixed duration limit while a client remains connected. [Errors and exceptions](https://developers.cloudflare.com/workers/observability/errors/), [Worker duration limits](https://developers.cloudflare.com/workers/platform/limits/#duration).

## Effect source

The installed `effect/src/ai/internal/mcpProtocol/v2026_07_28.ts` handler for `subscriptions/listen` acknowledges the subscription, then waits for notification queue entries or overflow. The SSE conversion in `effect/src/ai/McpServer.ts` frames messages without adding periodic comments. No heartbeat is scheduled in those paths.

The screenshot constructs a new `HttpRouter.toWebHandler` for every request. Our production entry caches the handler, yet still reproduces the failure. The local per-request mode reproduces the screenshot's construction separately.

## Reproduce

From the project root, capture a live request:

```sh
python3 scripts/check-subscription.py https://min-mcp-server-worker-mcp-production.lloyd-d-richards.workers.dev/mcp
```

For the local control fixture, start:

```sh
bun wrangler dev apps/server-mcp/test-fixtures/subscription-worker.ts --local --port 9011 --compatibility-date 2026-06-17
```

In another terminal, run each mode:

```sh
python3 scripts/check-subscription.py 'http://localhost:9011/mcp?mode=cached'
python3 scripts/check-subscription.py 'http://localhost:9011/mcp?mode=per-request'
python3 scripts/check-subscription.py 'http://localhost:9011/mcp?mode=heartbeat'
python3 scripts/check-subscription.py 'http://localhost:9011/mcp?mode=timer-only'
```

Inspect the body and duration, not just the HTTP status. Raw measurements are in `docs/subscription-evidence/`. The fixture is an experimental control, not a production workaround. It is excluded from the deployed entry. No production code was changed or redeployed during this investigation.
