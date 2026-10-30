/* The version, out of package.json, the one place it lives. `make bump` moves
 * it. Imported rather than injected through vite's `define`, as in cwt: a
 * plain import means the same thing in the build and in every test tier, and
 * rollup drops the rest of package.json from the bundle. */

import { version } from "../../package.json";

/** The app's version, e.g. `1.1.0`, with no leading `v`. */
export const APP_VERSION: string = version;
