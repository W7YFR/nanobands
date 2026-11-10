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

/* Tesseract.js loads its worker, its WebAssembly core and its English data at
   run time, by URL. This serves them from node_modules on the dev server and
   writes them into the build, under tesseract/<version>/, so the page never
   fetches them from a CDN. The core comes in three builds, for relaxed SIMD,
   SIMD and neither; the worker picks one. The version in the path keeps a
   browser from mixing files of two versions. */
const tesseractVersion: string = JSON.parse(readFileSync(new URL("./node_modules/tesseract.js/package.json", import.meta.url), "utf8")).version;
const TESSERACT_FILES: Record<string, string> = {
  "worker.min.js": "tesseract.js/dist/worker.min.js",
  "tesseract-core-relaxedsimd-lstm.wasm.js": "tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js",
  "tesseract-core-simd-lstm.wasm.js": "tesseract.js-core/tesseract-core-simd-lstm.wasm.js",
  "tesseract-core-lstm.wasm.js": "tesseract.js-core/tesseract-core-lstm.wasm.js",
  "eng.traineddata.gz": "@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz",
};
function tesseractFiles(): Plugin {
  const dir = `tesseract/${tesseractVersion}/`;
  const read = (name: string): Buffer => readFileSync(new URL(`./node_modules/${TESSERACT_FILES[name]}`, import.meta.url));
  return {
    name: "tesseract-files",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const name = req.url?.split("?")[0]?.match(/\/tesseract\/[^/]+\/([^/]+)$/)?.[1];
        if (!name || !(name in TESSERACT_FILES)) return next();
        /* No Content-Encoding on the .gz: the worker unzips it itself. */
        res.setHeader("Content-Type", name.endsWith(".js") ? "text/javascript" : "application/octet-stream");
        res.end(read(name));
      });
    },
    generateBundle() {
      for (const name of Object.keys(TESSERACT_FILES)) this.emitFile({ type: "asset", fileName: dir + name, source: read(name) });
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
  plugins: [react(), devIcon(), tesseractFiles()],
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
          /* Not vitest's default port, which cwt's browser tier holds, so
             the two can run at once. */
          api: { port: 63415, strictPort: true },
          browser: {
            enabled: true,
            /* Full Chromium, not the headless shell. The shell scales a
               photo differently, and OCR reads it differently from a real
               browser. */
            provider: playwright({ launchOptions: { channel: "chromium" } }),
            headless: true,
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
  },
});
