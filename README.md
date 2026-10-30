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

The exports save the overlaid photo, the chart, or the traced curve as CSV.

---

## The band plan

US privileges per 47 CFR §97.301 and §97.305, checked against the
[ARRL frequency allocations chart](https://www.arrl.org/frequency-allocations).
It covers 2200 m through 23 cm for Technician, General, Advanced and Amateur
Extra. Power limits are not modeled. Check the current rules before you
transmit.

---

## What it is

A Vite and TypeScript app with no server. The band plan, the parsers, the
analysis, and the grid finder and tracer are plain modules in `app/src` that
take data and return data; `app/src/ui/app.ts` draws the page around them.

Reading START and STOP off the screen uses [Tesseract.js](https://tesseract.projectnaptha.com/),
loaded from a CDN the first time a photo is opened and pinned to one version
with a subresource integrity hash. Without a network it still works; you type
the frequencies.

## Working on it

`make` lists the helpers:

```
make dev           # the app with hot reload at localhost:5174
make dev:lan       # the same, on your LAN, for a phone
make test          # the pure tests
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
