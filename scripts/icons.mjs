/* Rebuild the raster icons from favicon.svg.
 *
 * The drawing lives in favicon.svg and nowhere else. The .ico and the PNG tiles
 * are rasterisations of it, so they are generated rather than drawn: edited by
 * hand they drift from the source and nothing notices. The same script as
 * cwt's, pointed at this repo's root.
 *
 * The .ico carries three sizes and each is rendered from the vector rather
 * than downscaled from the largest, so the small ones get a correctly sampled
 * pass of their own instead of a blur of the big one.
 *
 * Needs `rsvg-convert` (librsvg) and `magick` (ImageMagick) on PATH. Neither is
 * needed by the site; this runs when the drawing changes, which is rarely.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(ROOT, "favicon.svg");

/** @param {string} tool */
function need(tool) {
  try {
    execFileSync(tool, ["--version"], { stdio: "ignore" });
  } catch {
    console.error(
      `✗ ${tool} is not on PATH.\n` +
        "  This target rasterises an SVG and packs an .ico, which needs\n" +
        "  librsvg and ImageMagick:  brew install librsvg imagemagick",
    );
    process.exit(1);
  }
}

/** @param {string} src @param {number} size @param {string} out */
function render(src, size, out) {
  execFileSync("rsvg-convert", ["-w", String(size), "-h", String(size), src, "-o", out]);
}

need("rsvg-convert");
need("magick");

const work = mkdtempSync(join(tmpdir(), "nanobands-icons-"));
try {
  const icoParts = [16, 32, 48].map((/** @type {number} */ size) => {
    const out = join(work, `ico-${size}.png`);
    render(SOURCE, size, out);
    return out;
  });
  execFileSync("magick", [...icoParts, join(ROOT, "favicon.ico")]);

  const tiles = [
    { size: 180, name: "apple-touch-icon.png" },
    { size: 192, name: "icon-192.png" },
    { size: 512, name: "icon-512.png" },
  ];
  for (const { size, name } of tiles) render(SOURCE, size, join(ROOT, name));

  console.log("✓ favicon.ico, apple-touch-icon.png, icon-192.png, icon-512.png");
  console.log("  from favicon.svg — review the diff, it is what users see.");
} finally {
  rmSync(work, { recursive: true, force: true });
}
