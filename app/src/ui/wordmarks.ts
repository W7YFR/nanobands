/* The names, drawn in block letters: the callsign that links home, and the
 * app's name. The landing shows the name large as its hero; the header shows
 * it small. Both come from here so they cannot drift apart.
 *
 * Two CSS rules make the art art: `white-space: pre`, and `line-height: 1` so
 * the rows touch. Screen readers get the name, not the picture.
 */

export const CALLSIGN_ART = [
  "██╗    ██╗███████╗██╗   ██╗███████╗██████╗ ",
  "██║    ██║╚════██║╚██╗ ██╔╝██╔════╝██╔══██╗",
  "██║ █╗ ██║    ██╔╝ ╚████╔╝ █████╗  ██████╔╝",
  "██║███╗██║   ██╔╝   ╚██╔╝  ██╔══╝  ██╔══██╗",
  "╚███╔███╔╝   ██║     ██║   ██║     ██║  ██║",
  " ╚══╝╚══╝    ╚═╝     ╚═╝   ╚═╝     ╚═╝  ╚═╝"
].join("\n");

export const NAME_ART = [
  "███╗   ██╗ █████╗ ███╗   ██╗ ██████╗ ██████╗  █████╗ ███╗   ██╗██████╗ ███████╗",
  "████╗  ██║██╔══██╗████╗  ██║██╔═══██╗██╔══██╗██╔══██╗████╗  ██║██╔══██╗██╔════╝",
  "██╔██╗ ██║███████║██╔██╗ ██║██║   ██║██████╔╝███████║██╔██╗ ██║██║  ██║███████╗",
  "██║╚██╗██║██╔══██║██║╚██╗██║██║   ██║██╔══██╗██╔══██║██║╚██╗██║██║  ██║╚════██║",
  "██║ ╚████║██║  ██║██║ ╚████║╚██████╔╝██████╔╝██║  ██║██║ ╚████║██████╔╝███████║",
  "╚═╝  ╚═══╝╚═╝  ╚═╝╚═╝  ╚═══╝ ╚═════╝ ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═══╝╚═════╝ ╚══════╝"
].join("\n");

export const SUBTITLE = "Read a NanoVNA SWR sweep against the US band plan";
