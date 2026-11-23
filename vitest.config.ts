import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL("./packages/", import.meta.url));

// Workspace imports resolve to source, so tests need no build step.
// "@hackbuild/chat" maps to packages/chat/src/index.ts and
// "@hackbuild/chat/remote" to packages/chat/src/remote.ts.
export default defineConfig({
  resolve: {
    alias: [
      { find: /^@hackbuild\/([a-z-]+)$/, replacement: `${root}$1/src/index.ts` },
      { find: /^@hackbuild\/([a-z-]+)\/([a-z-]+)$/, replacement: `${root}$1/src/$2.ts` },
    ],
  },
  test: { include: ["packages/*/test/**/*.test.ts"], testTimeout: 60_000 },
});
