#!/usr/bin/env bash
# Publishes a build into its folder of the gh-pages branch, which GitHub Pages serves as the site
# (called by .github/workflows/deploy.yml):
#   scripts/pages-publish.sh <target> <build>   replace the target's folder with the contents of <build>
#   scripts/pages-publish.sh <target>           remove the target's folder
# <target> is "release" (the site's root, whose preview/ and pr/ folders are kept), "preview" (main) or
# "pr/<number>". A published folder gets a version.json ({id, label, path, ref, commit, date}; label and ref
# from $PUBLISH_LABEL and $PUBLISH_REF, commit from $PUBLISH_COMMIT), and the root's versions.json lists them
# all for the game's version picker (src/ui/versions.ts). With $GH_TOKEN, folders of pull requests that are
# no longer open are removed too.
# gh-pages is always a single commit, so old builds don't pile up in the repository. Several workflows can
# publish at once: a push that lost the race starts again from the new gh-pages.
set -euo pipefail

target=$1
build=${2:+$(realpath "$2")}
case "$target" in
  release) folder=. id=release path='' ;;
  preview) folder=preview id=preview path=preview/ ;;
  pr/[0-9]*) folder=$target id=pr-${target#pr/} path=$target/ ;;
  *) echo "Not a target: $target (release, preview or pr/<number>)" >&2; exit 1 ;;
esac
site=$(mktemp -u)
trap 'git worktree remove --force "$site" 2>/dev/null || true' EXIT

# The open pull requests' numbers, one per line, or "unknown" without a token or when GitHub can't be asked.
open_prs=unknown
if [ -n "${GH_TOKEN:-}" ] && [ -n "${GITHUB_REPOSITORY:-}" ]; then
  open_prs=$(gh api --paginate "repos/$GITHUB_REPOSITORY/pulls?state=open&per_page=100" --jq '.[].number') || open_prs=unknown
fi

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
    find "$site" -mindepth 1 -maxdepth 1 ! -name .git ! -name preview ! -name pr -exec rm -rf {} +
  else
    rm -rf "${site:?}/$folder"
  fi
  if [ -n "$build" ]; then
    mkdir -p "$site/$folder"
    cp -a "$build/." "$site/$folder/"
    jq -n --arg id "$id" --arg label "${PUBLISH_LABEL:-$target}" --arg path "$path" --arg ref "${PUBLISH_REF:-}" \
      --arg commit "${PUBLISH_COMMIT:-}" --arg date "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
      '{id: $id, label: $label, path: $path, ref: $ref, commit: $commit, date: $date}' >"$site/$folder/version.json"
  fi

  if [ "$open_prs" != unknown ] && [ -d "$site/pr" ]; then
    for dir in "$site"/pr/*/; do
      [ -d "$dir" ] || continue
      n=$(basename "$dir")
      grep -qxF "$n" <<<"$open_prs" || { echo "Removing pr/$n (pull request is closed)"; rm -rf "$dir"; }
    done
  fi
  # The release, then the preview, then the pull requests, newest first.
  (
    cd "$site"
    shopt -s nullglob
    prs=(pr/*/version.json)
    files=()
    for f in version.json preview/version.json; do [ -f "$f" ] && files+=("$f"); done
    [ ${#prs[@]} -gt 0 ] && files+=($(printf '%s\n' "${prs[@]}" | sort -t/ -k2,2nr))
    if [ ${#files[@]} -gt 0 ]; then jq -s '{versions: .}' "${files[@]}"; else echo '{"versions":[]}'; fi
  ) >"$site/versions.json"
  touch "$site/.nojekyll"  # serve the files as they are, without Jekyll

  git -C "$site" add -A
  if [ -n "$old" ] && git -C "$site" diff --cached --quiet "$old"; then
    echo "gh-pages is already up to date"
    exit 0
  fi
  if [ -n "$build" ]; then message="Publish $target ${PUBLISH_REF:-} ${PUBLISH_COMMIT:-}"; else message="Remove $target"; fi
  commit=$(git -C "$site" commit-tree "$(git -C "$site" write-tree)" -m "$message")
  if git push --quiet --force-with-lease="refs/heads/gh-pages:$old" origin "$commit:refs/heads/gh-pages"; then
    if [ -n "${GITHUB_REPOSITORY:-}" ]; then
      url="https://${GITHUB_REPOSITORY_OWNER,,}.github.io/${GITHUB_REPOSITORY#*/}/$path"
      if [ -n "$build" ]; then summary="Published ${PUBLISH_LABEL:-$target} to $url"; else summary="Removed $url"; fi
      echo "$summary" | tee -a "${GITHUB_STEP_SUMMARY:-/dev/null}"
    fi
    exit 0
  fi
  echo "gh-pages moved on while publishing (attempt $attempt), starting again"
  sleep $((attempt + RANDOM % 5))
done
echo "Could not publish to gh-pages" >&2
exit 1
