#!/usr/bin/env bash
set -euo pipefail

REPOSITORY=""
VERSION="latest"

usage() {
  cat <<'USAGE'
Usage: install-release.sh --repo OWNER/REPOSITORY [--version vX.Y.Z]

Downloads a Quota Pilot GitHub release, verifies SHA-256 checksums, installs
the OpenClaw plugin, restarts the Gateway, and installs the VS Code extension.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo)
      REPOSITORY="${2:-}"
      shift 2
      ;;
    --version)
      VERSION="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ ! "$REPOSITORY" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]]; then
  echo "--repo must be a GitHub OWNER/REPOSITORY value." >&2
  exit 2
fi

for command in curl node openclaw sha256sum; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "Required command not found: $command" >&2
    exit 1
  fi
done

if [[ "$VERSION" == "latest" ]]; then
  RELEASE_JSON="$(curl --fail --silent --show-error --location \
    "https://api.github.com/repos/$REPOSITORY/releases/latest")"
  VERSION="$(printf '%s' "$RELEASE_JSON" | node -e '
    const { readFileSync } = require("node:fs");
    const value = JSON.parse(readFileSync(0, "utf8")).tag_name;
    if (!/^v[0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?$/.test(value ?? "")) process.exit(1);
    process.stdout.write(value);
  ')"
fi

if [[ ! "$VERSION" =~ ^v[0-9]+\.[0-9]+\.[0-9]+([+-][0-9A-Za-z.-]+)?$ ]]; then
  echo "--version must look like v0.3.6." >&2
  exit 2
fi

PACKAGE_VERSION="${VERSION#v}"
PLUGIN_NAME="openclaw-quota-pilot-$PACKAGE_VERSION.tgz"
VSIX_NAME="openclaw-quota-pilot-vscode-$PACKAGE_VERSION.vsix"
DOWNLOAD_BASE="https://github.com/$REPOSITORY/releases/download/$VERSION"
TEMP_DIR="$(mktemp -d)"
trap 'rm -rf -- "$TEMP_DIR"' EXIT

for asset in SHA256SUMS "$PLUGIN_NAME" "$VSIX_NAME"; do
  echo "Downloading $asset..."
  curl --fail --silent --show-error --location \
    --output "$TEMP_DIR/$asset" "$DOWNLOAD_BASE/$asset"
done

echo "Verifying release checksums..."
(
  cd "$TEMP_DIR"
  sha256sum --check --strict SHA256SUMS
)

if openclaw plugins inspect quota-pilot --json >/dev/null 2>&1; then
  openclaw plugins install "npm-pack:$TEMP_DIR/$PLUGIN_NAME" --force
else
  openclaw plugins install "npm-pack:$TEMP_DIR/$PLUGIN_NAME"
fi
openclaw plugins enable quota-pilot
openclaw gateway restart

GATEWAY_HEALTHY=false
for _attempt in {1..20}; do
  if openclaw gateway health >/dev/null 2>&1; then
    GATEWAY_HEALTHY=true
    break
  fi
  sleep 1
done
if [[ "$GATEWAY_HEALTHY" != "true" ]]; then
  echo "Gateway did not become healthy after restart." >&2
  exit 1
fi
openclaw plugins inspect quota-pilot --runtime --json >/dev/null

VSCODE_CLI=""
if command -v code >/dev/null 2>&1; then
  VSCODE_CLI="$(command -v code)"
else
  VSCODE_SERVER_ROOT="${VSCODE_AGENT_FOLDER:-${HOME}/.vscode-server}"
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
  "$VSCODE_CLI" --install-extension "$TEMP_DIR/$VSIX_NAME" --force
  echo "Quota Pilot $PACKAGE_VERSION installed. Reload the VS Code window."
else
  SAVED_VSIX_DIR="$(mktemp -d "${TMPDIR:-/tmp}/quota-pilot-vsix.XXXXXX")"
  SAVED_VSIX="$SAVED_VSIX_DIR/$VSIX_NAME"
  cp "$TEMP_DIR/$VSIX_NAME" "$SAVED_VSIX"
  echo "The backend is installed, but no VS Code CLI was found."
  echo "Use Extensions: Install from VSIX... with: $SAVED_VSIX"
fi
