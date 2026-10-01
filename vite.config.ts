import { effectNative, recommended } from "@effect/tsgo/oxlint-presets";
import { defineConfig } from "vite-plus";

export default defineConfig({
  lint: {
    extends: [recommended, effectNative],
    options: {
      denyWarnings: true,
    },
    overrides: [
      {
        files: ["apps/server-mcp/test-fixtures/subscription-worker.ts"],
        // Native timers isolate Cloudflare liveness from Effect's subscription runtime.
        rules: {
          "effecttsgo/async-function": "off",
          "effecttsgo/global-timers": "off",
        },
      },
      {
        files: ["alchemy.run.ts"],
        // Alchemy v1 runs as an async script outside the Effect server runtime.
        rules: {
          "effecttsgo/global-console": "off",
          "effecttsgo/process-env": "off",
        },
      },
      {
        files: ["**/*.test.ts", "**/*.test.tsx"],
        rules: {
          "effecttsgo/async-function": "off",
          "effecttsgo/node-builtin-import": "off",
          "effecttsgo/prefer-schema-over-json": "off",
        },
      },
    ],
  },
  run: {
    cache: {
      scripts: true,
      tasks: true,
    },
  },
});
