import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
/* From vitest rather than vite: the `test` key below is vitest's. */
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";
import type { Plugin } from "vite";

/* On the dev server only, the tab icon's letters are green, so a dev tab
   stands apart from the live site. The icon is favicon.svg with its stroke
   recolored, inlined in place of both icon links. */
function devIcon(): Plugin {
  return {
    name: "dev-icon",
    apply: "serve",
    transformIndexHtml(html) {
      const svg = readFileSync(new URL("./app/public/favicon.svg", import.meta.url), "utf8").replace('stroke="#6aa9ff"', 'stroke="#3fb950"');
      const href = `data:image/svg+xml,${encodeURIComponent(svg)}`;
      return html
        .replace(/<link rel="icon" href="favicon\.ico"[^>]*>\n?/, "")
        .replace(/<link rel="icon" href="favicon\.svg"[^>]*>/, `<link rel="icon" href="${href}" type="image/svg+xml">`);
    },
  };
}

/* Three test tiers, chosen by directory, as in cwt:

     test/pure     no DOM at all. The band plan, the parsers, the analysis, and
                   the grid finder and tracer run over synthetic pixel buffers.
                   Milliseconds, and most of the value.
     test/dom      React against jsdom: the components' markup and wiring.
                   jsdom has no canvas, so the photo and the chart are not
                   drawn here.
     test/browser  real Chromium. Decoding a real photo needs a canvas, and
                   IndexedDB needs a browser; neither can be faked into
                   meaning anything.

   `npm test` runs pure and dom. The browser tier is `npm run test:browser`
   and needs `npx playwright install chromium` once. */
export default defineConfig({
  root: "app",
  plugins: [react(), devIcon()],
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
          name: "dom",
          environment: "jsdom",
          setupFiles: ["./test/setup-dom.ts"],
          include: ["test/dom/**/*.test.{ts,tsx}"],
        },
      },
      {
        extends: true,
        test: {
          name: "browser",
          include: ["test/browser/**/*.test.{ts,tsx}"],
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
