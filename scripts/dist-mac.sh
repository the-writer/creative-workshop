#!/bin/sh
set -eu

cd "$(dirname "$0")/.."

sh scripts/clean-dist.sh
pnpm run build

# AppleDouble sidecars caused by file provenance attributes can make pkgbuild
# register the same install script twice.
if command -v xattr >/dev/null 2>&1; then
  xattr -c scripts/pkg-scripts/preinstall scripts/pkg-scripts/postinstall
fi
export COPYFILE_DISABLE=1

# The app is ad-hoc signed by afterPack when no formal macOS identity is configured.
# Keep electron-builder from auto-discovering unrelated keychain identities.
if [ -z "${CSC_LINK:-}${CSC_NAME:-}${APPLE_ID:-}" ]; then
  export CSC_IDENTITY_AUTO_DISCOVERY=false
fi

pnpm exec electron-builder --mac --arm64 --publish never

# Keep the release directory focused on distributable artifacts.
find release -mindepth 1 -maxdepth 1 ! -name '*.pkg' -exec rm -rf -- {} +
VSIX_VERSION="$(node -p "require('./vscode-extension/package.json').version")"
cp "vscode-extension/creation-workshop-v${VSIX_VERSION}.vsix" release/
