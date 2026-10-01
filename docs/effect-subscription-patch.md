# Effect subscription heartbeat patch

The missing transport heartbeat reproduces the Cloudflare cancellation. A Bun patch adding a periodic SSE comment prevents that failure in both local workerd and a separate deployed Cloudflare Worker.

## Mechanism

`subscriptions/listen` acknowledges the request, then waits on Effect queues for notifications. The HTTP response stream has a pending read, but an idle subscription has no native timer or other pending I/O event that can make progress. Cloudflare detects this as a hung request and cancels it. This is an inference supported by the timer-only control and the exact local runtime diagnostic, rather than a claim that we inspected Cloudflare's internal scheduler. See [the baseline investigation](subscriptions-cloudflare.md).

The code that creates a handler on each request is not the cause of this particular cancellation: both cached and per-request handlers fail without the patch and stay open with it. Resource disposal for per-request handlers remains a separate concern.

## Patch

The Bun patch is `patches/effect@4.0.0.patch`. It changes `McpServer.layerHttp`'s SSE response conversion in both `src/ai/McpServer.ts` and `dist/ai/McpServer.js`. The package exports the compiled JavaScript, so patching TypeScript alone would not exercise the runtime fix.

Only subscription response streams merge in a heartbeat stream. `Stream.tick("15 seconds")`, with its immediate first tick dropped, emits `: keepalive\n\n` at 15-second intervals. SSE comments are transport frames, not JSON-RPC notifications. They do not alter MCP message schemas or the subscription acknowledgement.

The original message stream is the left side of `Stream.merge`, with `haltStrategy: "left"`. The intended lifecycle is for response completion, failure, or cancellation to close the heartbeat stream's scope. Ordinary RPC responses and non-subscription SSE streams do not acquire heartbeat timers. The interval is fixed for this minimal experiment; a configurable transport option can be considered upstream.

## Evidence

| Check                                             | Result                                                   |
| ------------------------------------------------- | -------------------------------------------------------- |
| Unpatched live subscriptions                      | Closed after 51–72 ms                                    |
| Unpatched local cached/per-request subscriptions  | Closed after 36–38 ms with hung-request diagnostic       |
| Patched local cached subscription                 | Open for 32.017 s; two heartbeat comments                |
| Patched local per-request subscription            | Open for 32.017 s; two heartbeat comments                |
| Patched separate Cloudflare test Worker           | Open for 32.016 s; two heartbeat comments                |
| Ordinary calls during an open subscription        | tools/list and tools/call succeeded; ping returned pong  |
| Client cancellation and subsequent local requests | Client deadlines ended streams; later requests succeeded |
| Fresh frozen-lockfile install                     | Reapplied both source and compiled-runtime changes       |
| Project checks                                    | Type checking, lint, formatting, and build passed        |

Raw captures are in `docs/subscription-evidence/patched-*.json`. Curl exit 28 is expected because the client ended each 32-second observation. There was no premature server EOF. The cached and per-request fixture modes use no native timer wrapper in these patched tests.

No automated assertion yet counts active timers after disconnect or proves cleanup after server-initiated completion/failure. Those lifecycle cases need focused upstream tests before treating the patch as a finished library change. These tests also do not establish indefinite connection stability, delivery of later change events, or subscription routing across isolates.

## Repeat

Bun reapplies the patch during installation:

```sh
bun install --frozen-lockfile
```

The patch was prepared with `bun patch effect@4.0.0` and persisted with `bun patch --commit node_modules/effect`, following [Bun's patch workflow](https://bun.com/docs/pm/cli/patch).

Start the local fixture:

```sh
bun wrangler dev apps/server-mcp/test-fixtures/subscription-worker.ts --local --port 9011 --compatibility-date 2026-06-17
```

Check the patched cached handler without an application timer wrapper:

```sh
python3 scripts/check-subscription.py 'http://localhost:9011/mcp?mode=cached' --seconds 32 --expect-open --min-heartbeats 2
```

The assertion flags fail on premature EOF, absent acknowledgement, a JSON-RPC completion/error, or missing heartbeat comments.

The separate test Worker uses the `subscription-test` stage:

```sh
bun alchemy deploy --stage subscription-test --profile min_mcp-server-worker
```

Its endpoint is `https://min-mcp-server-worker-mcp-subscription-test.lloyd-d-richards.workers.dev/mcp`. The production Worker remains on the unpatched version. A future production deploy from this patched branch would include the patch.

## Upstream direction

Add heartbeat scheduling at the MCP HTTP transport boundary for idle subscription SSE responses. Test comment framing, first-message acknowledgement, scoped timer cleanup on cancellation/completion/failure, and unchanged ordinary RPC responses. Keep the Cloudflare runtime reproduction as an integration check: a Bun-only test cannot establish workerd's liveness behavior.
