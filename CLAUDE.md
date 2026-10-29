# Contributing

NanoBands is one static page, `index.html`, and its icons. There is no build
and no CI. GitHub Pages serves whatever is on `main`, so a merge is a deploy.

## Workflow

The contributor runs the release steps, and may ask Claude to run `make pr`,
merge the pull request or run `make release`. Claude may create the branch,
since starting a task starts there. Claude commits only when the contributor
asks for a commit in that message, never on its own: every commit needs human
review first. An earlier ask does not carry over. Claude runs `make pr`,
merges the pull request and runs `make release` on the same terms: only when
the contributor asks for it in that message. Otherwise Claude never pushes,
and never opens, edits or merges a pull request. Claude never runs
`make bump` or `make tag`.

`make release` asks to delete the local branch, and it cannot read an answer
when Claude runs it. After it fails at that prompt, Claude deletes the merged
branch with `git branch -d`.

When asked, Claude stages work for review. Work on several changes at once
can then be committed in parts: Claude stages the hunks for one part, and the
contributor reviews and commits it, or asks Claude to. Staging changes only
the index. Claude never resets or moves the branch. A commit message, by
Claude or suggested by Claude, is one line: a type prefix and a summary,
such as `fix: keep a dip's label clear of its dot`. It has no body and no
trailer.

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
5. The contributor merges, or asks Claude to. Merging deploys the site.
6. The contributor runs `make release`, or asks Claude to. It updates `main`,
   tags and pushes the version with the entry as its notes, and deletes the
   merged branch.

A branch that touches no file the site serves releases no version and needs
no bump. The contributor names its pull request with `make pr TITLE="..."`.
The files the site serves are `SITE` in `scripts/version.mjs`.

The version lives in one place: `const APP_VERSION` in `index.html`, which the
footer shows. Only `make bump` changes it.

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

- `make icons` rebuilds the .ico and PNG icons from `favicon.svg`.
```

- Groups in this order, each only if it has items: Added, Changed, Removed,
  Fixed, Development.
- Added, Changed, Removed and Fixed are for people who use the site.
- Development is for contributors: `make` targets, scripts and tooling. A
  branch that touches no file the site serves writes only here.
- One bullet per change. One or two short sentences.
- Bold a control's name as the page labels it.
- A fix says what the user saw go wrong, not the cause.

### Brevity

- No refactors, file names or function names outside Development.
- No reasons, mechanisms or history. Say what changed, not how.
- No numbers unless the reader sees them (a default, a threshold, a size).
- One term per concept, the term the page uses.
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
