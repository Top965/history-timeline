import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "src"),
      // Next's guard module throws outside a React Server environment; tests import server modules directly.
      "server-only": resolve(import.meta.dirname, "tests/support/empty.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.{ts,tsx}", "tests/db/**/*.test.ts"],
    env: { NODE_ENV: "test" },
    // Database tests share one database and reset rows they touch; run files one at a time.
    fileParallelism: false,
  },
});
