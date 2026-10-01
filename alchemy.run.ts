import alchemy from "alchemy";
import { Worker } from "alchemy/cloudflare";

const app = await alchemy("min-mcp-server-worker");

export const worker = await Worker("mcp", {
  entrypoint: "./apps/server-mcp/src/worker.ts",
  url: true,
  compatibilityDate: "2026-06-17",
  bindings: {
    MCP_ALLOWED_ORIGINS: process.env["MCP_ALLOWED_ORIGINS"] ?? "",
  },
});

console.log({ mcpUrl: worker.url && `${worker.url}/mcp` });
await app.finalize();
