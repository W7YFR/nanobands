import { fileURLToPath, URL } from "node:url";
/* From vitest rather than vite: the `test` key below is vitest's. */
import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";

/* Two test tiers, chosen by directory:

     test/pure     no DOM at all. The band plan, the parsers, the analysis, and
                   the grid finder and tracer run over synthetic pixel buffers.
                   Milliseconds, and most of the value.
     test/browser  real Chromium. Decoding a real photo needs a canvas, and
                   IndexedDB needs a browser; neither can be faked into
                   meaning anything.

   `npm test` runs the pure tier. The browser tier is `npm run test:browser`
   and needs `npx playwright install chromium` once. */
export default defineConfig({
  root: "app",
  // Relative, so the build works at the domain root or under /nanobands/.
  base: "./",
  server: {
    port: 5174,
    strictPort: true,
    fs: {
      /* What the dev server may hand out. `make dev:lan` puts it on the
         network, so it serves the app, its packages and the version, and not
         the rest of the repository. */
      allow: [
        fileURLToPath(new URL("./app", import.meta.url)),
        fileURLToPath(new URL("./node_modules", import.meta.url)),
        fileURLToPath(new URL("./package.json", import.meta.url)),
      ],
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./app/src", import.meta.url)),
    },
  },
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    target: "es2022",
    // The source is public on GitHub, so source maps add weight and nothing else.
    sourcemap: false,
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "pure",
          environment: "node",
          include: ["test/pure/**/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "browser",
          include: ["test/browser/**/*.test.ts"],
          browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
  },
});
