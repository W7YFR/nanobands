# Changelog

What each release of NanoBands changes, newest first. The Development group
lists changes to the tooling, which ship nothing to the site. Unreleased lists
changes merged to main that no version holds yet. The next release carries
them.

## Unreleased

### Added

- **Keep** on the chart keeps the NanoVNA's sweep as a dashed line, to compare the next sweeps with, up to three. A click on its chip hides it, and **×** or **Clear** drops it.
- **Dip path** joins the kept sweeps' dips to the sweep's dip while the chart is zoomed in.

## v1.15.0 — 2026-11-12

### Added

- The page dims and shows a spinner while it sweeps, loads a slot, reads the slots or opens a photo. It says what it is doing and how far it has got. Live sweeps leave the page free.
- **Connect NanoVNA** and the NanoVNA panel say **Connecting…** until the first sweep is in.

### Changed

- The chart's note counts the fine sweeps, as **✦ 10 fine sweeps**, rather than naming each band, and no longer says to zoom in. A ✦ chip's tooltip says its calibration is filled in.
- The Export buttons name their files as **Touchstone (.s1p)** does: **Chart (.png)**, **Photo with overlay (.png)** and **SWR (.csv)**, which was **Data (CSV)**.
- The **Fine** row lines its bands up in even columns. **+ Band** goes once every band it offers has a fine sweep.

### Fixed

- The status line in the NanoVNA panel no longer breaks onto a second line when a sweep of all bands reaches the whole range.
- A photo the browser cannot open, such as a HEIC photo outside Safari, no longer flashes the page before the dialog shows.

## v1.14.0 — 2026-11-12

### Added

- **All bands** in the **+ Band** menu fine-sweeps every band it offers and shows them together when the last is in. The panel says how far it has got.
- **All** in the **Fine** row makes Sweep and Live cover the whole range and each fine band. A band in the row makes them repeat only that band.

### Changed

- **+ Band** offers a band whatever its SWR. It no longer grays out a band that is all at the top of the SWR scale.
- The ✦ on a fine-swept band's chip above the chart sits on its corner, so the chips no longer shift.

## v1.13.5 — 2026-11-11

### Changed

- A file that does not open says why in a dialog, with **Choose another file**.

### Fixed

- A HEIC photo from an iPhone that the browser can't open says to open it in Safari or as a JPEG. A file that does not open no longer replaces the last photo or file after a refresh.

### Development

- `make release` runs from a worktree while another checkout has `main`. It updates, tags and pushes from that checkout, and keeps the branch the worktree holds.
- `make restart` stops this repo's dev server, wherever it runs, and serves the current checkout at localhost:5174.
- `make restart` no longer refuses to stop a dev server whose worktree was removed while it ran.
- The `finalize` skill commits the branch, checks the changelog, opens the pull request, fixes CI failures, merges when green and runs `make release`.

## v1.13.4 — 2026-11-11

### Changed

- When **Max SWR** is above the top of the SWR scale, the chart draws no Max SWR line and says that Max SWR is above the scale.

### Fixed

- A photo with glare across the screen finds its whole grid, and reads its sweep and SWR scale.
- The trace keeps a jagged curve's dips and spikes where it runs along a grid line, or where the photo shows it nearly white.
- A segment at the edge of a photo's sweep no longer shows as partly outside the sweep. Where the trace misses the start or the end of the sweep, **Band segments** says "no trace below" or "no trace above" that point.

### Development

- The browser tests check that the trace keeps to the curve on every photo, that no Max SWR line is drawn above the scale, and that the glare and HF photos read right turned on their side. `ocr.test.ts` lists no misses.

## v1.13.3 — 2026-11-10

### Fixed

- More photos read their SWR scale, such as 2 m sweeps and a 1–100 scale.
- The grid is found on photos taken at an angle, and no longer takes an edge outside the screen for its border.
- The trace follows a pale or jagged curve across the whole plot. **Sensitivity** moves to the level that found it.
- More photos read START and STOP right when their zeros run together.

### Development

- `screen-parts.ts` squares up a part of the screen for OCR. The START/STOP row, the SWR labels and the header each use it.
- `photo.test.ts` checks that every photo with a whole grid traces nearly every column. `scale.test.ts` covers the label column. `ocr.test.ts` no longer lists the scale misses it fixed.

## v1.13.2 — 2026-11-10

### Fixed

- More photos read START and STOP right, such as 2 m sweeps whose zeros read as 6 or 8. They read the same in every browser.

### Development

- `sweep-row.ts` reads the START/STOP row under the grid on its own. `ocr.test.ts` no longer lists the START and STOP misses it fixed.

## v1.13.1 — 2026-11-10

### Changed

- **Frequency reference** asks for the frequency in the page's own dialog, not the browser's prompt.

## v1.13.0 — 2026-11-10

### Added

- A photo that does not look like a NanoVNA screen opens a question over the page: **Choose another photo** or **Use it anyway**.

### Development

- `ocr.test.ts` checks that real OCR takes every real photo for a NanoVNA screen, and a drawn spreadsheet for something else.

## v1.12.7 — 2026-11-10

### Fixed

- A photo the phone saved on its side or upside down opens with the screen upright.

### Development

- The browser tier's `orient.test.ts` turns each real photo a quarter, a half and three quarters, and checks the page stands it back up. The pure tier's checks the turns themselves.

## v1.12.6 — 2026-11-10

### Changed

- Reading a photo's text needs Chrome 91, Firefox 89, Safari 16.4 or later. In an older browser, you type the sweep.

## v1.12.5 — 2026-11-10

### Changed

- Reading a photo's text no longer loads anything from a third-party site. The text-recognition library comes from NanoBands itself. **Terms** says so.

### Development

- Tesseract.js is 7.0.0. It and its English data are package dependencies. The build writes the worker, the cores and the data to `tesseract/7.0.0/`, and the dev server serves them from `node_modules`.
- The page test replaces the `tesseract.js` module in place of a stand-in on `window.Tesseract`.
- `ocr.test.ts` runs real OCR on every photo in `app/test/data`. It lists what each screen says, and what Tesseract misreads.
- Six new photos: a 2 m sweep on three SWR scales, at three angles and with glare, and a 6–50 MHz sweep on a 1–100 scale.

## v1.12.4 — 2026-11-09

### Changed

- **License** starts on Technician until you pick a class. Pick your class again if you picked one before.

### Development

- The tests that read HF segments set the license class to General.

## v1.12.3 — 2026-11-09

### Added

- **Terms**, in the footer and at the right of the warning at the top of the page, opens the terms of use: what NanoBands reads, what it does not check, your responsibility, and that nothing leaves the browser.

## v1.12.2 — 2026-11-09

### Changed

- The warning at the top of the page shows for a NanoVNA sweep and a Touchstone file too, worded for the device's readings.

### Fixed

- A connected NanoVNA with no calibration applied now says so under **Calibration**, since its readings are raw.
- NanoVNA and file readings near the top of the SWR scale no longer count as off the scale. The usable stretches, the key points and the frequency check take every reading as known.
- A Touchstone file of Y, Z, G or H parameters no longer reads as S11.
- An SWR reading never shows above 999.

## v1.12.1 — 2026-11-08

### Fixed

- A fast stroke with **Pen fix** no longer loses the start of its line.

### Development

- A page test draws a pen stroke faster than the page redraws.

## v1.12.0 — 2026-11-08

### Added

- **+ Band**, in the NanoVNA panel's **Fine** row, sweeps a band with all the NanoVNA's points and shows it on the chart. The chart puts those readings in the band, marks it, and notes that its calibration is filled in.
- When the chart shows a band, the **Fine** row offers it, such as **+ 40m**.
- **+ Band** grays out a band that a fine sweep would not help, and says why: the slot already sweeps it closely, its calibration is too coarse, or it is all over the SWR scale.
- Fine sweeps of several bands all stay on the chart. The **Fine** row lists them, and **Sweep** and **Live** repeat the band pressed there.
- While **Live** runs, the chart and the NanoVNA panel say what it sweeps, such as "Live: 40m only". The **Fine** row's × drops the fine sweeps at once and sweeps the whole range again.
- **Line**, **Points** and **Both**, in the chart's header, show the line between readings, the readings, or both, for a NanoVNA sweep or a Touchstone file. **Both** is the default. Readings too close together to tell apart are left out, and the chart's note says to zoom in. A reading over the top of the scale shows as a ▲.
- The hover readout says whether its SWR is a reading or an estimate. In **Points** it moves to the nearest reading.
- **SWR**, in the chart's header, sets the top of the SWR scale to 3, 5 or 10 for a NanoVNA sweep or a Touchstone file. 5 is the default.
- Each band's ends, and the ends of the segments your license class and **Mode** allow, show as ticks on the curve once the band is wide enough on the chart. The hover snaps to a tick and names the edge, and a click pins it.

### Changed

- The pointer over a band's rows in the Band segments table no longer moves the chart. A click still shows the band.

### Fixed

- Where a NanoVNA sweep or a Touchstone file rises past the top of the chart, the curve no longer leaves the top early. The hover's dot now stays on the curve.

### Development

- Tests cover which bands get a fine sweep, how fine sweeps of two bands fill in the full sweep, **Live** and ×. The stand-in NanoVNA can take time to answer a scan, so a test can act while one runs.
- A chart test covers a curve that crosses the top of the SWR scale.
- Chart and page tests cover readings: their dots, the ▲, **Points** and its snap to a reading.
- Tests cover band edges: which ones each class and **Mode** get, the ticks, and a click that pins one.
- A page test covers the SWR scale's top.

## v1.11.3 — 2026-11-07

### Fixed

- Picking an empty slot under **Calibration** now says the slot is empty. It no longer shows that slot as chosen.
- A `clearconfig` with the wrong key in **Shell** no longer drops the slot names.
- A line longer than 63 characters in **Shell** no longer ends in "stopped answering". **Shell** does not send it, and says why.

### Development

- The stand-in NanoVNA says `Err, default load` for an empty slot, or nothing with `quiet`, and answers `clearconfig`.

## v1.11.2 — 2026-11-07

### Fixed

- The NanoVNA's screen no longer freezes after **Sweep**, **Live** or **Disconnect**. It sweeps again on its own.

### Development

- The stand-in NanoVNA pauses on `scan` and answers `pause` and `resume`.

## v1.11.1 — 2026-11-03

### Fixed

- When the chart is zoomed in, the curve now reaches both edges. It no longer stops short of them.

### Development

- A chart test draws a curve with sparse samples in a zoomed view.

- Page tests cover session restore, OCR failures, exports, **Pen fix**, frequency references and **Detect grid**. The live sweep test pins a frequency first.

## v1.11.0 — 2026-11-02

### Added

- **Read**, by **Shell**, reads the range and calibration in each NanoVNA slot, then returns to the slot it started on. **Calibration** then names each slot by its range, marks a slot that is empty or S11 only, and selects the slot the NanoVNA is on.
- **Read** asks first, in a dialog, when the NanoVNA's calibration matches no known slot. If it still matches none after the read, a note names the slot the NanoVNA is on.
- The slot names stay for the next connection. A `save` or `clearconfig` in the shell updates them.

### Development

- The stand-in NanoVNA has the seven slots read from an H4, and answers `cal` and `save`.
- Tests cover reading the slots, their names in the menu and the slot list the browser keeps.

## v1.10.0 — 2026-11-02

### Added

- **Shell**, by **Connected**, opens a full-page prompt that sends commands to the NanoVNA and shows its replies. It holds **Live**, and the chart follows a range the shell changes.
- In the shell, **?** opens the list of commands beside the prompt, open the first time. A click on a command puts it in the prompt.
- The shell warns to only run commands you understand.
- The shell does not send commands that restart the device, print binary data or wait for a touch on the screen.

### Changed

- A connected NanoVNA marks **Load** done, as an open file does. Its settings stay in view until **Change**, which offers only **Disconnect** or a file instead.

### Fixed

- After a refresh, the last NanoVNA sweep no longer shows in **Load** as an opened `.s1p` file.

### Development

- Tests cover the shell, the **Load** card while connected, and a refresh after a NanoVNA sweep.

## v1.9.0 — 2026-11-01

### Added

- While a photo is open, the top of the page warns that its reading is best effort and that you transmit at your own risk.

### Development

- Tests cover where the photo warning shows.

## v1.8.1 — 2026-11-01

### Added

- The chart labels its red dashed line with Max SWR, such as Max SWR 3.

### Fixed

- A photo with an SWR scale other than 1–5 no longer reads its curve on a 1–5 scale. **Top SWR** and **Bottom SWR** now come from the scale labels on the photo, and the Calibrate card shows the scale it read.
- A curve flat along the top of the scale no longer counts as usable when **Max SWR** is at or above **Top SWR**. The chart shows those stretches as the red dashed line alone, and readouts show SWR ≥ the top.

### Development

- Tests cover reading the SWR scale from real OCR output and from a scale that does not start at 1, and a curve flat along the top of the scale.

## v1.8.0 — 2026-11-01

### Added

- With the pointer over a band in **Band segments**, the chart shows that band. A click keeps it there, and a second click goes back to the view before.
- **All** and **Usable** in **Band segments** list every band, or only the bands with a usable part.
- Over a segment's bar, a tooltip gives the range of the usable or unusable stretch under the pointer. Between 60 m's channels, it says you may not transmit there.
- A round **×** in **Frequency** clears it.

### Changed

- The band table's title is **Band segments**.

### Fixed

- The **?** no longer sits a little low in its circle.

### Development

- Tests cover the band table's hover, click, **All** and **Usable**, the bar's tooltip, and the **×** in **Frequency**.

## v1.7.1 — 2026-11-01

### Fixed

- The small buttons, such as **Change**, **Done**, **View** and **Cancel**, are all one width. A button keeps its width when its label changes.

## v1.7.0 — 2026-11-01

### Added

- **Frequency** in the Analyze card gives the SWR, band and segment at a frequency, and whether you may transmit there and why not. The chart marks it until Enter, or a click on the mark, pins it.
- **View** under **Frequency** zooms the chart to the frequency's band, or close around it outside the bands.

### Fixed

- A pin's label on the chart and its row in **Key points** are no longer always white. They take the curve's color there, as a dip does.
- Over a pin, the chart shows one label, not two. The hover's readout takes the curve's color too.

### Development

- Tests cover the frequency check, its result in the Analyze card, its mark on the chart and **View**, and the colors of a pin and the hover's readout.

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
