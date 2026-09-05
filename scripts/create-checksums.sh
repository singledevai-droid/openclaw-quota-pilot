#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

VERSION="$(node -p "require('./package.json').version")"
PLUGIN="artifacts/openclaw-quota-pilot-$VERSION.tgz"
VSIX="artifacts/openclaw-quota-pilot-vscode-$VERSION.vsix"

for artifact in "$PLUGIN" "$VSIX"; do
  if [[ ! -f "$artifact" ]]; then
    echo "Missing release artifact: $artifact" >&2
    exit 1
  fi
done

(cd artifacts && sha256sum "$(basename "$PLUGIN")" "$(basename "$VSIX")" > SHA256SUMS)
echo "Created artifacts/SHA256SUMS for Quota Pilot $VERSION."
