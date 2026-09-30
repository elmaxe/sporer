#!/bin/bash
# Claude Code on the web: install dependencies when a session starts, so typecheck, tests, the smoke test and the
# screenshot tool work straight away (Chromium is already in the container: /opt/pw-browsers).
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"
# ci, not install: install rewrites package-lock.json with whatever npm the container has.
npm ci --no-audit --no-fund
