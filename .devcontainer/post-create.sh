#!/usr/bin/env bash
set -euo pipefail

echo "==> Detecting package manager..."
if bun --version &>/dev/null; then
  echo "    Bun $(bun --version) available."
  # Only run install if workspace packages exist (post-scaffold)
  if [ -f "package.json" ]; then
    bun install
  else
    echo "    No package.json yet — skipping install (run after scaffold)."
  fi
else
  echo "    Bun unavailable — falling back to pnpm"
  pnpm install
fi

echo "==> Installing Playwright headless Chromium shell..."
if command -v bunx &>/dev/null; then
  bunx playwright install chromium-headless-shell --with-deps 2>/dev/null || true
else
  npx playwright install chromium-headless-shell --with-deps 2>/dev/null || true
fi

echo ""
echo "==> Dev container ready."
echo ""
echo "    SCAFFOLD (first time only):"
echo "      npx wxt@latest init apps/browser-extension"
echo "      → choose template: svelte-ts"
echo "      → choose package manager: bun"
echo ""
echo "    DAILY DEV:"
echo "      bun run dev"
echo "      Load in Chrome: apps/browser-extension/.output/chrome-mv3-dev/"
echo ""
echo "    TESTS:  bun run test"
echo "    LINT:   bun run lint"
