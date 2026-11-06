#!/bin/sh
set -eu

cd "$(dirname "$0")/.."

# 1. 全新清理并打包 macOS arm64 PKG（同时构建并复制 VS Code 插件 VSIX）
pnpm run dist:mac

# 2. 自动安装 VS Code 插件
pnpm run install:extension

# 3. 静默安装 PKG（无 Installer 图形界面）
VERSION="$(node -p "require('./package.json').version")"
PKG_PATH="release/creation-workshop-v${VERSION}-arm64.pkg"
if [ ! -f "$PKG_PATH" ]; then
  echo "未找到安装包：$PKG_PATH" >&2
  exit 1
fi

echo "正在静默安装：$PKG_PATH"
if [ "$(id -u)" -eq 0 ]; then
  installer -pkg "$PKG_PATH" -target /
else
  sudo installer -pkg "$PKG_PATH" -target /
fi
echo "安装完成：$PKG_PATH"
