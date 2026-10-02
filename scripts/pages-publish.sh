#!/usr/bin/env bash
# Publishes a build of a git ref into its folder of the gh-pages branch, which GitHub Pages serves as the site
# (called by .github/workflows/deploy.yml):
#   scripts/pages-publish.sh <ref> <build>   replace the ref's folder with the contents of <build>
#   scripts/pages-publish.sh <ref>           remove the ref's folder
# A tag (refs/tags/...) is the release at the root (its preview/ and branch/ folders are kept), refs/heads/main
# goes in preview/, any other branch in branch/<name>/. Folders of branches that no longer exist are removed too.
# gh-pages is always a single commit, so old builds don't pile up in the repository. Several workflows can
# publish at once: a push that lost the race starts again from the new gh-pages.
set -euo pipefail

# Folder name for a branch: lower case, anything but letters, digits, '.', '_' and '-' turned into '-'.
slug() { tr '[:upper:]' '[:lower:]' <<<"$1" | sed 's/[^a-z0-9._-]/-/g'; }

ref=$1
build=${2:+$(realpath "$2")}
case "$ref" in
  refs/tags/*) folder=. ;;
  refs/heads/main) folder=preview ;;
  refs/heads/*) folder=branch/$(slug "${ref#refs/heads/}") ;;
  *) echo "Not a branch or tag: $ref" >&2; exit 1 ;;
esac
site=$(mktemp -u)
trap 'git worktree remove --force "$site" 2>/dev/null || true' EXIT

for attempt in $(seq 10); do
  git worktree remove --force "$site" 2>/dev/null || true
  # Exit code 2: no gh-pages branch. Any other failure stops here rather than starting the site afresh.
  status=0; git ls-remote --exit-code --heads origin gh-pages >/dev/null || status=$?
  if [ "$status" = 0 ]; then
    git fetch --quiet --depth 1 origin gh-pages
    old=$(git rev-parse FETCH_HEAD)
    git worktree add --quiet --detach "$site" "$old"
  elif [ "$status" = 2 ]; then
    old=''  # first publish: gh-pages doesn't exist yet
    git worktree add --quiet --detach "$site"
    git -C "$site" rm -rq --cached --ignore-unmatch .
    git -C "$site" clean -fdxq
  else
    exit 1
  fi

  if [ "$folder" = . ]; then
    find "$site" -mindepth 1 -maxdepth 1 ! -name .git ! -name preview ! -name branch -exec rm -rf {} +
  else
    rm -rf "${site:?}/$folder"
  fi
  if [ -n "$build" ]; then
    mkdir -p "$site/$folder"
    cp -a "$build/." "$site/$folder/"
  fi

  if [ -d "$site/branch" ]; then
    live=$(git ls-remote --heads origin | sed 's|.*refs/heads/||' | while read -r b; do slug "$b"; done)
    for dir in "$site"/branch/*/; do
      [ -d "$dir" ] || continue
      grep -qxF "$(basename "$dir")" <<<"$live" || { echo "Removing branch/$(basename "$dir") (branch is gone)"; rm -rf "$dir"; }
    done
  fi
  touch "$site/.nojekyll"  # serve the files as they are, without Jekyll

  git -C "$site" add -A
  if [ -n "$old" ] && git -C "$site" diff --cached --quiet "$old"; then
    echo "gh-pages is already up to date"
    exit 0
  fi
  commit=$(git -C "$site" commit-tree "$(git -C "$site" write-tree)" \
    -m "Publish ${ref#refs/*/} ${GITHUB_SHA:-} to /${folder#.}")
  if git push --quiet --force-with-lease="refs/heads/gh-pages:$old" origin "$commit:refs/heads/gh-pages"; then
    if [ -n "${GITHUB_REPOSITORY:-}" ]; then
      url="https://${GITHUB_REPOSITORY_OWNER,,}.github.io/${GITHUB_REPOSITORY#*/}/${folder#.}"
      if [ -n "$build" ]; then summary="Published ${ref#refs/*/} to ${url%/}/"; else summary="Removed $url"; fi
      echo "$summary" | tee -a "${GITHUB_STEP_SUMMARY:-/dev/null}"
    fi
    exit 0
  fi
  echo "gh-pages moved on while publishing (attempt $attempt), starting again"
  sleep $((attempt + RANDOM % 5))
done
echo "Could not publish to gh-pages" >&2
exit 1
