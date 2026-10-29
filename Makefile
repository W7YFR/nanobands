# nanobands — read a NanoVNA SWR sweep against the US band plan.
#
# One static page and its icons, no build. GitHub Pages serves whatever is on
# main, so merging is deploying. These targets are the helpers around that:
# serving it locally, rebuilding the icons, and versioning a release the way
# cwt does.

.DEFAULT_GOAL := help

PORT ?= 8000

.PHONY: help
help: ## Show this help
	@grep -E '^[a-zA-Z_\\:-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN{FS="## "}{t=$$1; sub(/:[ \t].*$$/,"",t); gsub(/\\/,"",t); \
			printf "  \033[36m%-14s\033[0m %s\n", t, $$2}'

# Served rather than opened from disk: as a file:// page the browser refuses
# to read site.webmanifest and logs a CORS error for it.
.PHONY: serve
serve: ## Serve the site at localhost:8000 (PORT=… to change)
	@echo "→ http://localhost:$(PORT)/"
	python3 -m http.server $(PORT) --bind 127.0.0.1

# For a phone on the same Wi-Fi, so a photo of the VNA can go straight in. A
# photo upload needs no secure context, so plain http is enough. What is served
# is a folder of links to the site's own files and nothing else: serving the
# repository itself would hand .git and every scratch file in it to anyone on
# the network.
.PHONY: serve\:lan
serve\:lan: ## Serve only the site's files on your LAN, for a phone
	@dir=$$(mktemp -d); trap 'rm -rf "$$dir"' EXIT; \
	for f in $$(node scripts/version.mjs --site); do ln -s "$(CURDIR)/$$f" "$$dir/$$f"; done; \
	ip=$$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null); \
	echo "→ http://localhost:$(PORT)/"; \
	if [ -n "$$ip" ]; then echo "→ http://$$ip:$(PORT)/  (phone, same Wi-Fi)"; fi; \
	python3 -m http.server $(PORT) --bind 0.0.0.0 --directory "$$dir"

# The drawing lives in favicon.svg and nowhere else; the .ico and PNG tiles are
# generated from it. Needs librsvg and ImageMagick.
.PHONY: icons
icons: ## Rebuild the .ico and PNG icons from favicon.svg
	node scripts/icons.mjs

# ---- releasing ------------------------------------------------------------ #

# The version moves on a branch, before the pull request. The bump comes from
# the branch you are standing on: feat/ is a minor, fix/ and chore/ are
# patches. It sets APP_VERSION in index.html, the one place the version lives.
.PHONY: bump\:dry
bump\:dry: ## Say what this branch would release, change nothing
	node scripts/version.mjs --dry-run

.PHONY: bump
bump: ## Bump the version for this branch and commit it (run before the PR)
	node scripts/version.mjs --commit

# Write the branch's entry under `## Unreleased` in CHANGELOG.md first. The
# bump moves it under the new version, and the lines this branch wrote become
# the PR body. A branch that touches no file the site serves releases nothing,
# keeps its entry under Unreleased, and takes its title from the branch name,
# or TITLE.
.PHONY: pr
pr: ## Bump, push, and open or update this branch's PR (TITLE="..." for no-release)
	node scripts/pr.mjs $(if $(TITLE),--title "$(TITLE)")

.PHONY: tag
tag: ## Tag the current version at HEAD (on main, after merging)
	@v=$$(node scripts/version.mjs --current); \
		git tag -a "v$$v" -m "v$$v" && echo "tagged v$$v — \`git push origin v$$v\` when you mean it"

# Pushes the one new tag, not every local tag the way `git push --tags` does.
# The tag message and the GitHub release notes are the version's CHANGELOG.md
# entry. `--cleanup=whitespace` keeps its `###` headings, which git strips as
# comments by default. A merge that changed no site file kept the version, so
# it gets no tag. Run from a branch, it stops unless that branch's pull request
# is merged. Run from main, it offers the branch that main's last merge names.
# It offers the delete only when main contains the branch.
.PHONY: release
release: ## After merging: update main, tag and push its version, delete the branch
	@set -e; \
	git diff --quiet HEAD || { echo "Uncommitted changes — commit or stash first"; exit 1; }; \
	branch=$$(git rev-parse --abbrev-ref HEAD); \
	if [ "$$branch" != main ]; then \
		state=$$(gh pr view "$$branch" --json state --jq .state 2>/dev/null) \
			|| { echo "No pull request found for $$branch — open one with 'make pr', or run this from main"; exit 1; }; \
		[ "$$state" = MERGED ] || { echo "The pull request for $$branch is $$state, not merged — merge it first"; exit 1; }; \
	fi; \
	git switch main; \
	git pull --ff-only; \
	v=$$(node scripts/version.mjs --current); \
	if git rev-parse -q --verify "refs/tags/v$$v" >/dev/null; then \
		echo "v$$v is already tagged; main has no new version to release"; \
	else \
		notes=$$(node scripts/changelog.mjs "$$v" 2>/dev/null || true); \
		printf 'v%s\n\n%s\n' "$$v" "$$notes" | git tag -a "v$$v" --cleanup=whitespace -F -; \
		git push origin "v$$v"; \
		if [ -n "$$notes" ]; then \
			printf '%s\n' "$$notes" | gh release create "v$$v" --verify-tag --title "v$$v" --notes-file - \
				|| echo "tagged v$$v, but the GitHub release failed; retry with gh release create"; \
		fi; \
	fi; \
	if [ "$$branch" = main ]; then \
		branch=$$(node --input-type=module -e 'import { branchFromMerge } from "./scripts/version.mjs"; console.log(branchFromMerge(process.argv[1]) ?? "")' "$$(git log -1 --format=%s)"); \
	fi; \
	if [ -n "$$branch" ] && [ "$$branch" != main ] && git show-ref -q --verify "refs/heads/$$branch"; then \
		if ! git merge-base --is-ancestor "$$branch" main; then \
			echo "$$branch is not merged into main; kept"; \
			exit 0; \
		fi; \
		printf "Delete local branch %s? [Y/n] " "$$branch"; \
		read -r answer; \
		case "$$answer" in \
			[nN]*) echo "kept $$branch" ;; \
			*) git branch -d "$$branch" ;; \
		esac; \
	fi
