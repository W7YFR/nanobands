# Changelog

What each release of NanoBands changes, newest first. The Development group
lists changes to the tooling, which ship nothing to the site. Unreleased lists
changes merged to main that no version holds yet. The next release carries
them.

## Unreleased

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
