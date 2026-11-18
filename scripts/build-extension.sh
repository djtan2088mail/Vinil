#!/usr/bin/env bash
# Builds the Chrome extension from the same web app code: dist/extension (+ zip).
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf dist/extension && mkdir -p dist/extension
cp -r app/index.html app/manifest.webmanifest app/css app/js app/icons dist/extension/
cp extension/manifest.json extension/background.js dist/extension/
(cd dist && rm -f vinil-extension.zip && zip -qr vinil-extension.zip extension)
echo "Готово: dist/extension (загрузить как распакованное) и dist/vinil-extension.zip (для Chrome Web Store)"
