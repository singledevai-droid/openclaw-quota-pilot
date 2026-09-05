#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

if [[ ! -d node_modules ]]; then
  npm ci
fi

npm run verify

VERSION="$(node -p "require('./package.json').version")"
PLUGIN_ARCHIVE="$PROJECT_DIR/artifacts/openclaw-quota-pilot-$VERSION.tgz"
VSIX="$PROJECT_DIR/artifacts/openclaw-quota-pilot-vscode-$VERSION.vsix"

if openclaw plugins inspect quota-pilot --json >/dev/null 2>&1; then
  openclaw plugins install "npm-pack:$PLUGIN_ARCHIVE" --force
else
  openclaw plugins install "npm-pack:$PLUGIN_ARCHIVE"
fi

openclaw plugins enable quota-pilot
openclaw gateway restart

for _attempt in {1..20}; do
  if openclaw gateway health >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

openclaw plugins inspect quota-pilot --runtime --json
openclaw gateway call quota-pilot.status \
  --json \
  --timeout 15000 \
  --params '{"agentId":"main","sessionKey":"agent:main:main","refresh":true}'

VSCODE_CLI=""
if command -v code >/dev/null 2>&1; then
  VSCODE_CLI="$(command -v code)"
else
  VSCODE_SERVER_ROOT="${VSCODE_AGENT_FOLDER:-$HOME/.vscode-server}"
  if [[ -d "$VSCODE_SERVER_ROOT/cli/servers" ]]; then
    VSCODE_CLI="$(
      find "$VSCODE_SERVER_ROOT/cli/servers" \
        -type f -path '*/server/bin/code-server' -printf '%T@ %p\n' 2>/dev/null \
        | sort -nr \
        | awk 'NR == 1 { sub(/^[^ ]+ /, ""); print; exit }'
    )"
  fi
fi

if [[ -n "$VSCODE_CLI" && -x "$VSCODE_CLI" ]]; then
  "$VSCODE_CLI" --install-extension "$VSIX" --force
  echo "VS Code extension installed. Reload the VS Code window to activate it."
else
  echo "VS Code CLI was not found on this host."
  echo "Install this file with 'Extensions: Install from VSIX...':"
  echo "$VSIX"
fi
