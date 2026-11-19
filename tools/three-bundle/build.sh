#!/usr/bin/env bash
# Rebuilds vendor/three-view3d.min.js from three.js (MIT). Needs Node + npm.
set -euo pipefail
THREE_VERSION="${THREE_VERSION:-0.187.0}"
here="$(cd "$(dirname "$0")" && pwd)"; root="$(cd "$here/../.." && pwd)"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
cp "$here/entry.js" "$tmp/"
( cd "$tmp" && npm init -y >/dev/null && npm i --silent "three@$THREE_VERSION" esbuild \
  && npx esbuild entry.js --bundle --minify --format=iife --global-name=TinyTMTThree \
     --legal-comments=none --banner:js="/* three.js r${THREE_VERSION#0.} slice for TinyTMT View in 3D | three.js (c) 2010-2025 three.js authors | MIT licence | https://threejs.org */" \
     --outfile="$root/vendor/three-view3d.min.js" )
ls -l "$root/vendor/three-view3d.min.js"
