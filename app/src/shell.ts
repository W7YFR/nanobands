/* The commands the Shell window lists, and the ones it will not send.
 *
 * The list follows `help` on a NanoVNA-H4 with firmware 1.2.44. Other
 * firmware knows fewer or more commands. The window sends any command it
 * does not refuse, and the device answers `cmd?` to one it does not know.
 *
 * Some commands take over the port: they print binary data, wait for a touch
 * on the screen, or restart the device. The window refuses those.
 */

export interface ShellCommand {
  name: string;
  /** The arguments, as the firmware takes them. */
  args: string;
  /** What the command does, in one short sentence. */
  text: string;
  /** Why the window does not send it, when it does not. */
  refused?: string;
}

const BINARY = "Prints binary data, which this window cannot show.";
const TOUCH = "Waits for a touch on the screen and holds the port.";

export const SHELL_COMMANDS: ShellCommand[] = [
  { name: "help", args: "", text: "Lists the commands this firmware knows." },
  { name: "info", args: "", text: "Shows the board, firmware and build." },
  { name: "version", args: "", text: "Shows the firmware version." },
  { name: "sweep", args: "[start stop [points]]", text: "Shows or sets the sweep range in Hz." },
  { name: "scan", args: "start stop [points [mask]]", text: "Sweeps a range. Mask 1 prints frequency, 2 prints S11, 4 prints S21." },
  { name: "scan_bin", args: "start stop [points [mask]]", text: "Sweeps a range and prints it as binary.", refused: BINARY },
  { name: "frequencies", args: "", text: "Lists the frequencies of the sweep." },
  { name: "data", args: "[0|1]", text: "Prints S11 (0) or S21 (1) of the last sweep." },
  { name: "freq", args: "hz", text: "Stops the sweep and sends one frequency." },
  { name: "pause", args: "", text: "Stops the sweep." },
  { name: "resume", args: "", text: "Starts the sweep again." },
  { name: "power", args: "[0-3|255]", text: "Sets the drive level. 255 is auto." },
  { name: "bandwidth", args: "[hz]", text: "Shows or sets the IF bandwidth." },
  { name: "offset", args: "[hz]", text: "Shows or sets the IF offset." },
  { name: "cal", args: "[load|open|short|thru|isoln|done|on|off|reset]", text: "Runs a calibration step, or shows the calibration state." },
  { name: "save", args: "slot", text: "Saves the calibration and range to a slot." },
  { name: "recall", args: "slot", text: "Loads the calibration and range from a slot." },
  { name: "trace", args: "[n [type|scale|refpos|off] [value]]", text: "Shows or sets the traces." },
  { name: "marker", args: "[n [on|off|index]]", text: "Shows or sets the markers." },
  { name: "edelay", args: "[picoseconds]", text: "Shows or sets the electrical delay." },
  { name: "s21offset", args: "[db]", text: "Shows or sets the S21 offset." },
  { name: "smooth", args: "[0-8]", text: "Shows or sets the trace smoothing." },
  { name: "transform", args: "[on|off|impulse|step|bandpass|minimum|normal|maximum]", text: "Sets the time-domain transform." },
  { name: "measure", args: "[mode]", text: "Sets the measurement shown on the screen." },
  { name: "threshold", args: "hz", text: "Sets the frequency where harmonic mode starts." },
  { name: "tcxo", args: "[hz]", text: "Shows or sets the TCXO frequency." },
  { name: "vbat", args: "", text: "Shows the battery voltage." },
  { name: "vbat_offset", args: "[mv]", text: "Shows or sets the battery reading offset." },
  { name: "time", args: "[y|m|d|h|min|sec value]", text: "Shows or sets the clock." },
  { name: "config", args: "[flag value]", text: "Shows or sets the config flags." },
  { name: "color", args: "[n rgb]", text: "Shows or sets the screen colors." },
  { name: "msg", args: "delay text [header]", text: "Shows a message on the screen." },
  { name: "touch", args: "x y", text: "Presses the screen at a point." },
  { name: "release", args: "[x y]", text: "Lets go of the screen." },
  { name: "dump", args: "[0|1]", text: "Prints raw samples from the receiver." },
  { name: "sd_list", args: "[pattern]", text: "Lists the files on the SD card." },
  { name: "sd_delete", args: "file", text: "Deletes a file on the SD card." },
  { name: "sd_read", args: "file", text: "Prints a file on the SD card as binary.", refused: BINARY },
  { name: "saveconfig", args: "", text: "Saves the config to flash." },
  { name: "clearconfig", args: "1234", text: "Erases the config and every calibration slot." },
  { name: "usart_cfg", args: "[baud]", text: "Shows or sets the serial port speed." },
  { name: "usart", args: "text [ms]", text: "Sends text out the serial port and prints the answer." },
  { name: "capture", args: "", text: "Prints the screen as binary.", refused: BINARY },
  { name: "refresh", args: "[on|off]", text: "Sends the screen as binary after each change.", refused: BINARY },
  { name: "touchcal", args: "", text: "Calibrates the touch screen.", refused: TOUCH },
  { name: "touchtest", args: "", text: "Draws where the screen is touched.", refused: TOUCH },
  { name: "reset", args: "", text: "Restarts the device.", refused: "Restarts the device and closes the port." },
  { name: "dfu", args: "", text: "Restarts into firmware update mode.", refused: "Restarts the device and closes the port." },
];

/** Why the window does not send this line, or null when it does. */
export function refusal(line: string): string | null {
  const name = line.trim().split(/\s+/)[0] ?? "";
  return SHELL_COMMANDS.find((c) => c.name === name)?.refused ?? null;
}

/** How long a command may take, in ms. A sweep with a narrow IF bandwidth is slow. */
export function commandMs(line: string): number {
  return /^(scan|sweep|cal|recall|save|data|dump)\b/.test(line.trim()) ? 120_000 : 10_000;
}
