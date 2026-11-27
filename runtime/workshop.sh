#!/bin/sh
# Creation Workshop 命令行工具（macOS）。
#
# 本脚本只负责「拉起工具」：定位可用运行时（已安装的桌面应用 / node / 开发态 Electron），
# 把参数原样转发给命令行工具，由工具完成名称生成、角色库列表与写入。
#
# 安装：pkg 安装完成后会在 PATH 可达的目录（如 /usr/local/bin）建立名为 workshop 的软连接指向本文件。

set -u

APP_NAME="Creation Workshop"

# 解析脚本真实路径：软连接指向本文件时也要定位到 runtime 目录
self=$0
while [ -L "$self" ]; do
  target=$(readlink "$self")
  case "$target" in
    /*) self=$target ;;
    *) self=$(dirname -- "$self")/$target ;;
  esac
done
self_dir=$(CDPATH= cd -- "$(dirname -- "$self")" && pwd -P)

# 已安装的桌面应用：runtime 目录位于 Creation Workshop.app/Contents/Resources/runtime
app_bin="$self_dir/../../MacOS/$APP_NAME"
if [ -x "$app_bin" ]; then
  exec "$app_bin" --cli "$@"
fi

# 开发态：仓库根目录下的 runtime 目录
repo_root=$(CDPATH= cd -- "$self_dir/.." && pwd -P)

if [ -f "$repo_root/release/cli/cli.cjs" ] && command -v node >/dev/null 2>&1; then
  exec node "$repo_root/release/cli/cli.cjs" "$@"
fi

electron_bin="$repo_root/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron"
if [ -x "$electron_bin" ]; then
  exec "$electron_bin" "$repo_root" --cli "$@"
fi

echo "workshop: 找不到可用的运行时（请先构建应用或安装 Node.js）" >&2
exit 1
