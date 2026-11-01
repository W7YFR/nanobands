# NanoBands

**Read a NanoVNA SWR sweep against the US band plan.**

Take a photo of your NanoVNA's SWR screen, or export an `.s1p` file, and drop it
on the page. NanoBands traces the curve, finds the dips, the peaks and the
places it crosses your maximum SWR, and lays the US amateur band plan over it
for your license class. The answer is a table: which segments of which bands
your antenna is ready for, and which ones it is not.

Everything runs in the browser. No account, no upload, no server: the photo
never leaves the machine it was opened on.

Live at [w7yfr.com/nanobands](https://www.w7yfr.com/nanobands/).

---

## Using it

1. **Load.** Drop, paste or browse for a photo of the SWR screen, or a
   Touchstone `.s1p` file.
2. **Calibrate.** For a photo, the plot grid is found and the photo is squared
   up on it. The sweep's start and stop are read off the screen. If the grid
   looks off, **Edit corners** shows its four corners to drag into place. Type
   the frequencies if they were not in the shot.
3. **Trace.** The yellow curve is traced on its own, ignoring on-screen text.
   If a stretch goes astray, turn on **Pen fix** and drag along the real curve.
4. **Analyze.** Set **Max SWR**, **License** and **Mode**. The chart, the photo
   overlay and the table follow.

An `.s1p` file skips steps 2 and 3 and gives exact data instead of a traced
curve. NanoVNA-Saver writes one with **Files → Save 1-port file (S11)**.

### Reading the chart

The curve is green where you may transmit: inside your segments, at or under
**Max SWR**. It is gray where the SWR is under **Max SWR** outside your
segments, and yellow over it. Dips, and the brackets that mark each stretch
under **Max SWR**, take the same colors. The dashed red line is **Max SWR**,
and the red dots are where the curve crosses it.

The strip under the axis shows your segments, green where they are usable and
red where the SWR is too high. Hover over a band in the strip, or over its
name, for its lowest and highest SWR and how much of it is usable.

With a mouse, hover to read the SWR. Near a dip, a peak, a crossing or a pin,
the reading snaps to it. Click to pin a frequency, and click a pin to remove
it. Scroll or drag across the chart to zoom. When zoomed, Shift + scroll or a
middle-button drag pans. Double-click, or **Full sweep**, zooms back out. The
band chips zoom to one band.

On a phone or tablet, drag along the chart to read the SWR, and tap to pin.
**Zoom** makes the next drag zoom in. **⤢ Full screen** fills the window with
the chart.

### A connected NanoVNA

In desktop Chrome or Edge, **Connect NanoVNA** reads the sweep straight off the
device over USB. It sweeps the range the NanoVNA is set to, so its calibration
applies as is. **Live** sweeps again and again until **Hold**. **Calibration**
loads one of the device's saved slots, and its range, as the device's RECALL
menu does. Quit NanoVNA-Saver first: one program at a time can hold the port.

The NanoVNA, -H, -H4 and -F family work. The V2, SAA-2 and LiteVNA use a
different protocol and do not. For work without the device, `make dev` at
`/?fake` connects a stand-in NanoVNA instead.

The exports save the overlaid photo, the chart, the traced curve as CSV, or
the sweep as an `.s1p` file.

---

## The band plan

US privileges per 47 CFR §97.301 and §97.305, checked against the
[ARRL frequency allocations chart](https://www.arrl.org/frequency-allocations).
It covers 2200 m through 23 cm for Technician, General, Advanced and Amateur
Extra. Power limits are not modeled. Check the current rules before you
transmit.

---

## What it is

A Vite, React and TypeScript app with no server. The band plan, the parsers,
the analysis, the grid finder and tracer, and the NanoVNA shell are plain
modules in `app/src` that take data and return data. The page is React
components in `app/src/ui`, and the photo and the chart are drawn on canvases
by `draw-photo.ts` and `draw-chart.ts`.

Reading START and STOP off the screen uses [Tesseract.js](https://tesseract.projectnaptha.com/),
loaded from a CDN the first time a photo is opened and pinned to one version
with a subresource integrity hash. Without a network it still works; you type
the frequencies.

## Working on it

`make` lists the helpers:

```
make dev           # the app with hot reload at localhost:5174
make dev:lan       # the same, on your LAN, for a phone
make test          # the pure and dom tests
make browsers      # download Chromium for the browser tests (once)
make test-browser  # the page and the photo pipeline, in Chromium
make build         # build the site into dist/
make icons         # rebuild the .ico and PNG icons from app/public/favicon.svg
make bump:dry      # what this branch would release
make pr            # bump, push, and open the pull request
make release       # after merging: tag the version, with its notes
```

The browser tests run against two real photos of a NanoVNA-H4 in
`app/test/data`.

Branches carry a type prefix, and the prefix sets the version: `feat/` is a
minor, `fix/` and `chore/` are patches. The version lives in `package.json`;
`make bump` moves it and stamps the entry in [CHANGELOG.md](CHANGELOG.md). CI
tests every pull request and deploys the site when it merges.
[CLAUDE.md](CLAUDE.md) has the full workflow and the changelog rules.

## License

MIT. See [LICENSE](LICENSE).
