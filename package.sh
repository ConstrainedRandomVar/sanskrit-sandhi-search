#!/usr/bin/env bash
# Build the Chrome Web Store upload package: a zip of just the shipped extension
# files (manifest at the zip root), excluding repo/docs/build files.
set -euo pipefail
cd "$(dirname "$0")"

VERSION=$(node -e 'process.stdout.write(require("./manifest.json").version)' 2>/dev/null \
  || grep -o '"version"[^,]*' manifest.json | grep -o '[0-9.]\+')
OUT="sanskrit-sandhi-search-v${VERSION}.zip"

rm -f "$OUT"
zip -X "$OUT" \
  manifest.json background.js content.js highlight-core.js sanskrit-search.js \
  icons/icon16.png icons/icon32.png icons/icon48.png icons/icon128.png >/dev/null

echo "wrote $OUT"
unzip -l "$OUT"
