# Changelog

What each release of NanoBands changes, newest first. The Development group
lists changes to the tooling, which ship nothing to the site. Unreleased lists
changes merged to main that no version holds yet. The next release carries
them.

## Unreleased

### Added

- **Frequency** in the Analyze card gives the SWR, band and segment at a frequency, and whether you may transmit there and why not. The chart marks it until Enter, or a click on the mark, pins it.

### Development

- Tests cover the frequency check, its result in the Analyze card, and its mark on the chart.

## v1.6.1 — 2026-11-01

### Fixed

- The **Key points** table no longer shows every dip in green. A dip takes the chart's color for it: gray outside your segments, yellow over **Max SWR**.

### Development

- The README explains how to read the chart: its colors, the band tooltip, and zooming, panning and pinning.

## v1.6.0 — 2026-11-01

### Added

- The scroll wheel zooms the chart about the pointer, and never scrolls the page while over it. When zoomed, Shift + scroll, a sideways scroll or a middle-button drag pans.
- Over a band in the strip under the chart, or over its name, a tooltip gives the band's lowest and highest SWR and how much of it is usable.
- Near a dip, peak, crossing or pin, the chart's hover snaps to it. A click there pins the key point itself.

### Changed

- The curve is gray where the SWR is under **Max SWR** outside your segments. A dip and the bracket under a stretch take the curve's color. Green is only where you may transmit.
- A click on a pin removes it only when the hover has snapped to the pin. The readout says **click to unpin**.

### Development

- The browser tests cover the chart's wheel zoom, pan, band tooltip, snap and unpin, and its curve, dip and bracket colors on a real canvas.

## v1.5.0 — 2026-11-01

### Added

- With a mouse, **↔** next to **✎ Pen** stretches the photo wider. The photo scrolls sideways in its card, and a stroke held at either edge scrolls it along.
- **⤢ Full screen** fills the window with the chart, and the page behind stays put. **Done**, Back or Esc closes it.

### Changed

- On a phone or tablet turned sideways, **✎ Pen** puts **✎ Draw** and **⌫ Erase** on the right, so the photo uses the full height.
- On a phone, **Export** sits at the bottom of the page, under the tables.
- On a phone or tablet, a drag along the chart reads the SWR under the finger, and the reading stays until the next tap. **Zoom** makes the next drag zoom in instead.
- On a phone, the chart's resolution sits on its own line under the title, and the band chips scroll sideways in one row.

### Fixed

- A corner drag or a pen stroke no longer selects text on the page. On a phone or tablet, nothing on the page selects or opens a long-press menu.
- Dragging a corner no longer lags. The band plan, the trace and the key points hide during the drag and come back on release.
- On a photo whose screen dims toward one side, the grid reaches the plot's true edge. The trace no longer stops at the last frequency line.
- On a bright photo, the trace follows narrow dips to the bottom instead of cutting across them.
- **Start (MHz)** and **Stop (MHz)** fill in from photos that OCR reads with garbled zeros or units.

### Development

- The browser tests run on a third photo of the random wire, on a 1–3 SWR scale, with a dim right edge and narrow dips.

## v1.4.0 — 2026-10-31

### Changed

- **Load** shows a connected NanoVNA in its own panel, with a green **Connected** status, its calibration and range, and **Sweep** and **Live** side by side. The file drop sits under it, and no longer shows a NanoVNA sweep as an opened file.
- With a photo or .s1p file open, **Load** shrinks to a green check and the file name. **Change** brings back **Open another file** and **Connect NanoVNA**.
- **Calibrate** folds to a green check and its sweep once it finds the grid and reads the sweep, with **Change** to open it. Open, it lists what it found, with **Edit corners** next to **Grid found**, and each field and button has a **?**.
- **Trace** folds the same way once the auto-trace succeeds, and opens when it needs you. Each control has a **?**, and **Erase trace** is off with no trace.
- The photo has its own **✎ Pen** button, next to **Edit corners**, so you can fix the trace without leaving the photo. A pen fix no longer opens **Trace**.
- On a phone or tablet, **✎ Pen** fills the screen with the photo and its trace, and one finger steers a cursor with a magnifier that **✎ Draw** or **⌫ Erase** turns into a pen or an eraser. Two fingers zoom, the view follows the cursor near an edge, **↔** stretches steep curves wider, and **Undo** and **Clear marks** take back strokes.
- On a phone or tablet, a back swipe closes **✎ Pen** instead of leaving the page.
- A sideways swipe over the chart or the photo no longer goes back or forward a page.
- **Export** lists each file on its own row: **Photo with overlay (PNG)**, **Chart (PNG)**, **Data (CSV)** and **Touchstone (.s1p)**. **Chart (PNG)** and **Data (CSV)** are off until the sweep is known.
- **Analyze** lines up its fields, each with a **?** that says what it does. The chart's own **?** says how to pin and zoom, and a tap or a hover opens any **?**.
- The chart's legend shows only its colors and their names.
- **Key points** starts collapsed, with its count in the header. **Expand** opens it, and the page remembers.
- Dragging a photo or .s1p file over the page outlines the whole window, on the landing too. Dragged text no longer lights up the drop zone.
- A dropped or opened photo shows the page at once, with a placeholder where the photo goes until it is ready.

### Fixed

- On a phone, the chart and the tables no longer run past the right edge of the screen.
- On a phone, **Band segments you can use** stacks each band, with its bars full width, so it no longer scrolls sideways.
- A **?** near the bottom of the sidebar opens upward, so its text is not cut off.
- The chart's labels no longer overlap. **MHz** sits left of the axis, and on a narrow chart a label with no room is left out.
- The step numbers count only the steps on the page. With a NanoVNA or an .s1p file, **Analyze** is step 2.
- Right after a reload, the footer no longer shows at the top of an empty page. It stays at the bottom of the window.

### Development

- `make test-browser` has its own port, so it runs while cwt's browser tests run.

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
