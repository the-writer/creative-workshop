#!/bin/sh
set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Type checking"
pnpm run typecheck

echo "==> Bundling extension"
pnpm run compile

echo "==> Packaging VSIX"
pnpm exec vsce package --no-dependencies --allow-missing-repository --allow-star-activation --out type-stats.vsix

echo
echo "Done. Artifact: $ROOT/type-stats.vsix"
echo "Install with: code --install-extension \"$ROOT/type-stats.vsix\" --force"
