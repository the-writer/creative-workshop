#!/bin/sh
set -eu

for target in dist dist-electron release; do
  if [ -e "$target" ]; then
    rm -rf -- "$target"
  fi
done
