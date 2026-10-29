/* What version NanoBands is, decided by the branch the work is on.
 *
 * The same rules as cwt's script, with less around them. A branch prefix is a
 * statement about the size of a change: `feat/…` is a minor, `fix/…` and
 * `chore/…` are patches, and `feat!/…` is a major. This reads it and turns it
 * into the next version.
 *
 * The version lives in one place, `const APP_VERSION` in index.html, which the
 * footer shows. There is no package.json, no build and no CI to keep in step.
 *
 *   make bump:dry    # say what this branch would release, change nothing
 *   make bump        # set the version, stamp CHANGELOG.md, commit
 *
 * The bare version lands on stdout and the reasoning on stderr.
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { CHANGELOG, stamp, today, unreleased } from "./changelog.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const INDEX = `${ROOT}index.html`;

/** What each branch prefix is worth. Anything unrecognized is a patch: a
 *  release should not fail for a spelling. */
const LEVELS = /** @type {const} */ ({
  feat: "minor",
  fix: "patch",
  perf: "patch",
  refactor: "patch",
  chore: "patch",
  docs: "patch",
  style: "patch",
  revert: "patch",
});

/** @typedef {"major" | "minor" | "patch"} Level */

/** The files that reach the site. A branch that touches none of them changes
 *  nothing anybody sees, so it releases no version. */
export const SITE = [
  "index.html",
  "favicon.svg",
  "favicon.ico",
  "apple-touch-icon.png",
  "icon-192.png",
  "icon-512.png",
  "og-image.png",
  "site.webmanifest",
];

const RELEASE_SUBJECT = /^chore: release v\d+\.\d+\.\d+$/;

/** Whether a subject is one of this script's own release commits, so a second
 *  run on the same branch does not bump twice.
 *  @param {string} subject @returns {boolean} */
export function isReleaseSubject(subject) {
  return RELEASE_SUBJECT.test(subject);
}

/** Whether `type` is one of the branch prefixes above, as `feat` or `chore`.
 *  @param {string} type @returns {boolean} */
export function isType(type) {
  return Object.hasOwn(LEVELS, type.toLowerCase());
}

/** The branch a merge commit's subject names, with any remote or fork owner
 *  dropped: `Merge pull request #7 from W7YFR/feat/foo` is `feat/foo`.
 *  @param {string} subject @returns {string | null} */
export function branchFromMerge(subject) {
  const quoted = subject.match(/^Merge (?:[\w-]+ )*?(?:branch|branches) '([^']+)'/i);
  const bare = subject.match(/^Merge '([^']+)'/i);
  const pr = subject.match(/^Merge pull request #\d+ from (\S+)/i);
  const raw = quoted?.[1] ?? bare?.[1] ?? pr?.[1];
  if (!raw) return null;
  const parts = raw.split("/");
  const head = (parts[0] ?? "").replace(/!$/, "");
  return parts.length > 1 && !isType(head) ? parts.slice(1).join("/") : raw;
}

/** The bump a branch name asks for: `feat/foo` → minor, `feat!/foo` → major.
 *  @param {string} branch @returns {Level} */
export function levelFor(branch) {
  const m = branch.trim().match(/^([a-zA-Z]+)(!)?\//);
  if (!m) return "patch";
  if (m[2]) return "major";
  return LEVELS[/** @type {keyof typeof LEVELS} */ ((m[1] ?? "").toLowerCase())] ?? "patch";
}

/** The next version. Lower fields reset: 1.1.7 + minor is 1.2.0.
 *  @param {string} version @param {Level} level @returns {string} */
export function bump(version, level) {
  const m = version.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!m) throw new Error(`not a plain semver version: ${version}`);
  const [major, minor, patch] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (level === "major") return `${major + 1}.0.0`;
  if (level === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

const VERSION_LINE = /const APP_VERSION = '(\d+\.\d+\.\d+)';/;

/** The version index.html declares.
 *  @param {string} html @returns {string} */
export function versionIn(html) {
  const m = html.match(VERSION_LINE);
  if (!m) throw new Error("no `const APP_VERSION = 'x.y.z';` in index.html");
  return m[1] ?? "";
}

/** index.html with its version changed and nothing else.
 *  @param {string} html @param {string} version @returns {string} */
export function withVersion(html, version) {
  versionIn(html);
  return html.replace(VERSION_LINE, `const APP_VERSION = '${version}';`);
}

/** @param {...string} args */
function git(...args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

/** The files this branch changed since it left main. */
function changedSinceMain() {
  return git("diff", "--name-only", "main...HEAD").split("\n").filter(Boolean);
}

/** Whether this branch touches a file that reaches the site. */
function ships() {
  return changedSinceMain().some((p) => SITE.includes(p));
}

/** @param {string} message @returns {never} */
function die(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

const USAGE = `Move the version for the branch you are on.

  node scripts/version.mjs [options]

feat/ is a minor, fix/ and chore/ are patches, feat!/ is a major. A release
sets APP_VERSION in index.html and moves the entry under '## Unreleased' in
CHANGELOG.md to the new version. It refuses without an entry.

  -n, --dry-run       print the next version; write nothing
      --commit        write it and make the release commit
      --current       print the version index.html has now
      --ships         print whether this branch touches a file the site serves
      --site          print the files the site serves, one per line
      --branch <name> take the prefix from this name, not the current branch
      --release <l>   force the level: major | minor | patch
  -h, --help          this`;

function main() {
  const argv = process.argv.slice(2);
  /** @type {{ dry: boolean, commit: boolean, branch: string | null, release: Level | null }} */
  const opts = { dry: false, commit: false, branch: null, release: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-n" || a === "--dry-run") opts.dry = true;
    else if (a === "--commit") opts.commit = true;
    else if (a === "--branch") opts.branch = argv[++i] ?? die("--branch needs a name");
    else if (a === "--release") {
      const l = argv[++i];
      if (l !== "major" && l !== "minor" && l !== "patch") die("--release takes major, minor or patch");
      opts.release = l;
    } else if (a === "--current") {
      process.stdout.write(`${versionIn(readFileSync(INDEX, "utf8"))}\n`);
      return;
    } else if (a === "--ships") {
      process.stdout.write(`${ships()}\n`);
      return;
    } else if (a === "--site") {
      process.stdout.write(`${SITE.join("\n")}\n`);
      return;
    } else if (a === "-h" || a === "--help") {
      process.stdout.write(`${USAGE}\n`);
      return;
    } else die(`unknown option: ${a}\n\n${USAGE}`);
  }

  const branch = opts.branch ?? git("rev-parse", "--abbrev-ref", "HEAD");
  if (branch === "main") die("run this on a branch, not on main");

  const html = readFileSync(INDEX, "utf8");
  const current = versionIn(html);

  if (git("log", "--format=%s", "main..HEAD").split("\n").some(isReleaseSubject)) {
    process.stderr.write(`this branch already carries its release commit; v${current} stands\n`);
    process.stdout.write(`${current}\n`);
    return;
  }

  const level = opts.release ?? levelFor(branch);
  const next = bump(current, level);
  process.stderr.write(`${current} → ${next} (${opts.release ? "--release" : `branch '${branch}'`}: ${level})\n`);
  if (!ships()) process.stderr.write("note: this branch touches no file the site serves, so it needs no release\n");
  process.stdout.write(`${next}\n`);

  const log = readFileSync(CHANGELOG, "utf8");
  if (opts.dry || !opts.commit) {
    const pending = unreleased(log);
    process.stderr.write(pending ? `\nCHANGELOG.md entry:\n${pending}\n` : "CHANGELOG.md has nothing under '## Unreleased'\n");
    return;
  }

  /* Checked before anything is written. The release commit holds the version
     move and the changelog stamp, and nothing else. */
  const dirty = git("status", "--porcelain")
    .split("\n")
    .filter(Boolean)
    .filter((l) => !/ (index\.html|CHANGELOG\.md)$/.test(l));
  if (dirty.length) die(`the tree has other changes; commit or stash them first:\n${dirty.join("\n")}`);

  /** @type {string} */
  let stamped;
  try {
    stamped = stamp(log, next, today());
  } catch (e) {
    die(/** @type {Error} */ (e).message);
  }
  writeFileSync(INDEX, withVersion(html, next));
  writeFileSync(CHANGELOG, stamped);
  git("add", "--", INDEX, CHANGELOG);
  git("commit", "-m", `chore: release v${next}`);
  process.stderr.write(`committed chore: release v${next}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
