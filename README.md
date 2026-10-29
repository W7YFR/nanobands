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

One static page, no build step. What is in `index.html` is what gets served.

Reading START and STOP off the screen uses [Tesseract.js](https://tesseract.projectnaptha.com/),
loaded from a CDN the first time a photo is opened and pinned to one version
with a subresource integrity hash. Without a network it still works; you type
the frequencies.

## Working on it

There is nothing to compile. `make` lists the helpers:

```
make serve       # the site at localhost:8000
make serve:lan   # only the site's files, on your LAN, for a phone
make icons       # rebuild the .ico and PNG icons from favicon.svg
make bump:dry    # what this branch would release
make pr          # bump, push, and open the pull request
make release     # after merging: tag the version, with its notes
```

Opened straight from disk as `file://`, the page works, but the browser refuses
to read `site.webmanifest` and logs a CORS error for it. Served, it does not.

Branches carry a type prefix, and the prefix sets the version: `feat/` is a
minor, `fix/` and `chore/` are patches. The version lives in `APP_VERSION` in
`index.html`; `make bump` moves it and stamps the entry in
[CHANGELOG.md](CHANGELOG.md). [CLAUDE.md](CLAUDE.md) has the full workflow and
the changelog rules.

## License

MIT. See [LICENSE](LICENSE).
