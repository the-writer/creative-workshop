#!/bin/sh
set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO="$(cd "$ROOT/.." && pwd)"
cd "$ROOT"

VERSION="$(node -p "require('./package.json').version")"
ARTIFACT="type-stats-v${VERSION}.vsix"

echo "==> Syncing application icon"
mkdir -p assets/imgs
cp "$REPO/src/assets/imgs/app-icon.png" assets/imgs/app-icon.png

echo "==> Type checking"
pnpm run typecheck

echo "==> Bundling extension"
pnpm run compile

echo "==> Packaging VSIX"
rm -f type-stats*.vsix
pnpm exec vsce package --no-dependencies --allow-missing-repository --allow-star-activation --out "$ARTIFACT"

echo
echo "Done. Artifact: $ROOT/$ARTIFACT"
echo "Install with: code --install-extension \"$ROOT/$ARTIFACT\" --force"
