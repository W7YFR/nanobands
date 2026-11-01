# Contributing

NanoBands is a Vite, React and TypeScript app with no server, built like cwt.
Everything under `app/src` is the product: plain modules for the work, and
React components in `app/src/ui`. `app/test` holds three test tiers: `pure`
(no DOM) and `dom` (React in jsdom), both run with `make test`, and `browser`
(real Chromium, real NanoVNA photos, run with `make test-browser`). CI builds the site and deploys it to GitHub Pages when a
change to a build input merges to `main`.

## Workflow

The contributor runs the release steps, and may ask Claude to run `make pr`,
merge the pull request or run `make release`. Claude works on the branch
that is checked out. It creates, switches or splits branches only when the
contributor asks for it. Claude commits only when the contributor
asks for a commit in that message, never on its own: every commit needs human
review first. An earlier ask does not carry over. Claude runs `make pr`,
merges the pull request and runs `make release` on the same terms: only when
the contributor asks for it in that message. Claude merges only when CI is
green. Otherwise Claude never pushes, and never opens, edits or merges a pull
request. Claude never runs `make bump` or `make tag`.

Before Claude commits a photo or other file the contributor supplied, it
asks for explicit consent for that file and waits for a yes. It strips the
file's metadata first and checks that none is left. Consent to commit does
not cover a push: Claude asks again before `make pr` publishes the file.

`make release` asks to delete the local branch, and it cannot read an answer
when Claude runs it. After it fails at that prompt, Claude deletes the merged
branch with `git branch -d`.

When asked, Claude stages work for review. Work on several changes at once
can then be committed in parts: Claude stages the hunks for one part, and the
contributor reviews and commits it, or asks Claude to. Staging changes only
the index. Claude never resets or moves the branch. A commit message, by
Claude or suggested by Claude, is one line: a type prefix and a summary,
such as `fix: keep a dip's label clear of its dot`. It has no body and no trailer.

1. Claude or the contributor branches from `main` with a type prefix:
   `feat/` (minor), `fix/` or `chore/` (patch). The prefix sets the version
   bump, so pick it from what the change is.
2. Claude implements the change and writes the `CHANGELOG.md` entry as the
   work lands. The contributor reviews each piece, and commits it or asks
   Claude to.
3. The contributor may ask for `/changelog-check`, which verifies the entry
   against the diff.
4. The contributor runs `make pr`, or asks Claude to. It bumps the version,
   pushes, and opens the pull request. The title is `[TYPE] vX.Y.Z`. The body
   is the branch's changelog entry. A second run updates the pull request.
5. The contributor merges when CI is green, or asks Claude to.
6. The contributor runs `make release`, or asks Claude to. It updates `main`,
   tags and pushes the version with the entry as its notes, and deletes the
   merged branch.

A branch that touches no build input releases no version and needs no bump.
The contributor names its pull request with `make pr TITLE="..."`. The build
inputs are `BUILD_INPUTS` in `scripts/version.mjs`.

### Dependency updates

Take an update to a `chore/deps-<name>` branch from `main`. Run
`npm install <name>@<version>`, write the Development entry, such as
`- Vite is 6.4.5.`, then run `make pr`.

## Changelog

Every branch adds an entry to `CHANGELOG.md`. The entry is also the pull
request body, so it is the only description the change gets.

### When

Write or update the entry as the work lands, in the same session. Do not wait
for the end of the branch. Before the contributor runs `make pr`, the entry
must match the final diff.

### Where

Under `## Unreleased`, at the top. Never write a version heading. `make bump`
moves the text under `## vX.Y.Z — YYYY-MM-DD` in the release commit.

Other branches may have merged entries under `## Unreleased` that no release
has carried yet. Add to those groups. Do not edit their bullets.

### Shape

```
### Added

- **Collapse** shrinks the photo to its header row. **Expand** brings it back.

### Fixed

- A dip at the bottom of the chart no longer covers its dot with its label.

### Development

- `make icons` rebuilds the `.ico` and PNG icons from `app/public/favicon.svg`.
```

- Groups in this order, each only if it has items: Added, Changed, Removed,
  Fixed, Development.
- Added, Changed, Removed and Fixed are for people who use the site.
- Development is for contributors: the build, CI, `make` targets, the dev
  server, tests and tooling. A branch that touches no build input writes only here.
- One bullet per change. One or two short sentences.
- Bold a control's name as the page labels it.
- A fix says what the user saw go wrong, not the cause.

### Brevity

- No tests, refactors, file names or function names outside Development.
- No reasons, mechanisms or history. Say what changed, not how.
- No numbers unless the reader sees them (a default, a threshold, a size).
- One term per concept, the term the app uses.
- If a bullet needs a third sentence, cut it.
- Merge small related changes into one bullet.

## Writing style

For comments, commit messages and changelog entries. Model it on ASD-STE100
simplified technical English:

- One idea per sentence.
- Short declarative sentences.
- Active voice, present tense.
- No filler, no hedging, no preamble.
- One term per concept. Reuse the same word for the same thing.
