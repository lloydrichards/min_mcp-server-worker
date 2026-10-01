import { Config, ConfigProvider, Effect, Layer } from "effect";
import { McpProtocol, McpServer } from "effect/ai";
import { HttpRouter } from "effect/http";
import { McpCapabilities } from "./capabilities.js";

interface Env {
  readonly MCP_ALLOWED_ORIGINS: string;
}

const McpHttpLive = Layer.unwrap(
  Effect.gen(function* () {
    const origins = yield* Config.String("MCP_ALLOWED_ORIGINS").pipe(
      Config.withDefault(""),
    );

    return McpServer.layerHttp({
      name: "Stack Effect MCP Server",
      version: "0.1.0",
      path: "/mcp",
      // Stateless requests can be handled by any Cloudflare isolate.
      protocols: [McpProtocol.v2026_07_28],
      allowedOrigins: origins
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean),
    }).pipe(Layer.provideMerge(McpCapabilities));
  }),
);

let handler: ((request: Request) => Promise<Response>) | undefined;

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    handler ??= HttpRouter.toWebHandler(
      McpHttpLive.pipe(
        Layer.provide(ConfigProvider.layer(ConfigProvider.fromUnknown(env))),
      ),
    ).handler;
    return handler(request);
  },
};
