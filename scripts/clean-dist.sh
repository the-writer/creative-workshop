#!/bin/sh
set -eu

if [ -e release ]; then
  rm -rf -- release
fi
