#!/usr/bin/env bash
# Writes the preview's comment on a pull request, or updates it if it's there already, so there's only ever one
# (called by .github/workflows/deploy.yml; needs $GH_TOKEN and $GITHUB_REPOSITORY):
#   scripts/pages-pr-comment.sh <number> <markdown>
set -euo pipefail

pr=$1
marker='<!-- pages-preview -->'
body="$marker
$2"
id=$(gh api --paginate "repos/$GITHUB_REPOSITORY/issues/$pr/comments?per_page=100" \
  --jq ".[] | select(.body | startswith(\"$marker\")) | .id" | head -n 1)
if [ -n "$id" ]; then
  gh api --method PATCH "repos/$GITHUB_REPOSITORY/issues/comments/$id" -f body="$body" >/dev/null
else
  gh api --method POST "repos/$GITHUB_REPOSITORY/issues/$pr/comments" -f body="$body" >/dev/null
fi
