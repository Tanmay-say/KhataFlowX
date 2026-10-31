import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["apps/**/*.test.ts", "packages/**/*.test.ts", "scripts/**/*.test.ts"],
    setupFiles: ["apps/api/src/test/setup.ts"],
  },
});
