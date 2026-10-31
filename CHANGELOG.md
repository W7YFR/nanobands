# Changelog

What each release of NanoBands changes, newest first. The Development group
lists changes to the tooling, which ship nothing to the site. Unreleased lists
changes merged to main that no version holds yet. The next release carries
them.

## Unreleased

### Fixed

- Right after a reload, the footer no longer shows at the top of an empty page. It stays at the bottom of the window.

## v1.3.0 — 2026-10-31

### Changed

- With nothing loaded, the page shows only the name, its description, **Connect NanoVNA** and **Open a photo or .s1p file**. Once a sweep, photo or file loads, the name moves up into the header and the rest appears.
- **Photo + overlay PNG** appears only when a photo is loaded.
- On a phone, the header shows the callsign and **Clear** on one row and the name under them.

### Fixed

- The page no longer shows a flash of unstyled text while it loads.

### Development

- The page is a React app, built like cwt. Each card, the photo and the chart are components, and the canvas drawing lives in its own modules.
- `make test` runs a new dom tier too: the components in jsdom, with Testing Library.
- React is 19.3.0.

## v1.2.0 — 2026-10-31

### Added

- **Connect NanoVNA** reads a sweep straight from a NanoVNA over USB, in desktop Chrome or Edge. It sweeps the range the device is set to.
- **Live** sweeps the NanoVNA again and again until **Hold**. **Calibration** loads one of the device's saved slots and its range.
- **Touchstone .s1p** saves the sweep as a file.

### Development

- `make dev` at `/?fake` connects a stand-in NanoVNA. The tests use it too.
- The tab icon under `make dev` has green letters.
- The console logs each command sent to a connected NanoVNA, and its reply.

## v1.1.1 — 2026-10-30

### Fixed

- The page has the same margin on the left and the right, with or without a scroll bar.

### Development

- `make serve` serves the site locally, and `make serve:lan` serves only its files to a phone on the same Wi-Fi.
- `make icons` rebuilds the .ico and PNG icons from `favicon.svg`.
- `make bump`, `make pr` and `make release` version, open and tag a release from the branch prefix, as in cwt. This file records each release.
- `CLAUDE.md` holds the workflow, changelog and writing rules, and `/changelog-check` checks a branch's entry against its diff.
- The site is a Vite and TypeScript app. `make dev` serves it with hot reload, `make dev:lan` serves it to a phone, and `make build` builds it into `dist/`.
- `make test` runs the pure tests, and `make test-browser` runs the page and the photo pipeline in Chromium against real photos of a NanoVNA-H4.
- CI tests every pull request, checks its version bump and changelog entry, and deploys the site to GitHub Pages when it merges.
- The version lives in `package.json`, and `make bump` moves it there.
- `make serve` now serves the last build, and `make serve:latest` builds first. `make serve:lan` is gone; `make dev:lan` replaces it.

## v1.1.0 — 2026-10-29

### Added

- Moving across the chart or the photo puts a dot on the curve with its frequency and SWR, in both at once.
- **Pen fix**'s magnifier shows the trace, including the stroke being drawn.
- **Collapse** shrinks the photo to its header row. **Expand** brings it back.

### Changed

- A dip at the bottom of the chart or a peak at the top keeps its label clear of its dot.

## v1.0.0 — 2026-10-28

### Added

- Load a photo of a NanoVNA SWR screen, or a Touchstone `.s1p` file, and see which US band segments are usable at a maximum SWR, for a license class and mode.
- From a photo, the plot grid is found and the photo squared up on it, the curve is traced, and the sweep's START and STOP are read off the screen.
- **Edit corners**, **Pen fix** and **+ Frequency reference** correct a photo where the automatic steps get it wrong.
- The chart marks each dip, each peak and each crossing of the maximum SWR, and shows the stretches under it. Click the chart to pin a marker.
- **Photo + overlay PNG**, **Chart PNG** and **CSV** export the results.
- A refresh keeps the file and everything done to it. **Clear** starts over.
