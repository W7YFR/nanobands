/* The colophon every W7YFR app ends with: the year, the callsign, the version. */

import { APP_VERSION } from "@/build-info";

export function Footer(): React.ReactElement {
  return (
    <footer className="colophon">
      © <span id="year">{new Date().getFullYear()}</span>{" "}
      <a href="https://www.qrz.com/db/W7YFR" target="_blank" rel="noreferrer">W7YFR</a> ·{" "}
      <a href="https://github.com/W7YFR/nanobands" target="_blank" rel="noreferrer">v<span id="version">{APP_VERSION}</span></a>
    </footer>
  );
}
