import { Effect, Layer, Schema } from "effect";
import { McpProtocol, McpServer, Tool, Toolkit } from "effect/ai";
import { HttpRouter } from "effect/http";

const Ping = Tool.make("ping", { success: Schema.String });
const tools = Toolkit.make(Ping);
const Mcp = McpServer.layerHttp({
  name: "subscription-repro",
  version: "0.0.0",
  path: "/mcp",
  protocols: [McpProtocol.v2026_07_28],
}).pipe(
  Layer.merge(McpServer.toolkit(tools)),
  Layer.provide(tools.toLayer({ ping: () => Effect.succeed("pong") })),
);

let cached:
  | { readonly handler: (request: Request) => Promise<Response> }
  | undefined;

export default {
  async fetch(request: Request): Promise<Response> {
    const mode = new URL(request.url).searchParams.get("mode") ?? "cached";
    const handler =
      mode === "per-request"
        ? HttpRouter.toWebHandler(Mcp)
        : (cached ??= HttpRouter.toWebHandler(Mcp));
    const response = await handler.handler(request);
    if ((mode !== "heartbeat" && mode !== "timer-only") || !response.body) {
      return response;
    }
    const reader = response.body.getReader();
    let timer: ReturnType<typeof setInterval>;
    return new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          timer = setInterval(() => {
            if (mode === "heartbeat") {
              controller.enqueue(new TextEncoder().encode(": keepalive\n\n"));
            }
          }, 1000);
          const pump = async () => {
            try {
              while (true) {
                const chunk = await reader.read();
                if (chunk.done) {
                  controller.close();
                  break;
                }
                controller.enqueue(chunk.value);
              }
            } catch (error) {
              controller.error(error);
            } finally {
              clearInterval(timer);
            }
          };
          void pump();
        },
        cancel(reason) {
          clearInterval(timer);
          return reader.cancel(reason);
        },
      }),
      response,
    );
  },
};
