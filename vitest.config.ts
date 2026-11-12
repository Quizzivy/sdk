import path from "node:path";
import { defineConfig } from "vitest/config";

// The contract's own tests (D-082 (i)): structural invariants of
// api/openapi.yaml and the shapes the server and its clients agree on. They
// moved here from the web's tests/units/contract when the contract got its own
// repository, so every contract PR runs them.
export default defineConfig({
  resolve: {
    alias: {
      "@tests": path.resolve(import.meta.dirname, "./tests"),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    globals: true,
  },
});
