#!/usr/bin/env bash
set -euo pipefail

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
  "$VSCODE_CLI" --uninstall-extension \
    openclaw-community.openclaw-quota-pilot-vscode || true
fi

if openclaw plugins inspect quota-pilot --json >/dev/null 2>&1; then
  openclaw plugins uninstall quota-pilot --force
  openclaw gateway restart
fi

echo "Quota Pilot packages removed. Sanitized state is retained under the OpenClaw state directory."
