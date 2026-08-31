# Installation, upgrade, and removal

## Before you start

Confirm that all required CLIs resolve on the OpenClaw host:

```bash
node --version
openclaw --version
openclaw gateway health
```

Quota Pilot supports Node.js 22.22.3+, OpenClaw 2026.7.1-2+, and VS Code
1.95+. Back up `~/.openclaw/openclaw.json` before installing any third-party
OpenClaw plugin.

## Install checksummed release artifacts

Download `scripts/install-release.sh` from the repository, inspect it, then:

```bash
bash install-release.sh --repo singledevai-droid/openclaw-quota-pilot
```

Pin a version when reproducibility matters:

```bash
bash install-release.sh \
  --repo singledevai-droid/openclaw-quota-pilot \
  --version v0.3.9
```

The installer uses the release's `SHA256SUMS`. It stops before installation if
either downloaded artifact does not match.

## Install from source

```bash
git clone https://github.com/singledevai-droid/openclaw-quota-pilot.git
cd openclaw-quota-pilot
npm ci
npm run verify
./scripts/install-local.sh
```

The last command installs `artifacts/openclaw-quota-pilot-<version>.tgz`,
enables the plugin, restarts the Gateway, runs a sanitized status check, and
installs the generated VSIX.

## Activate the extension

Reload the VS Code window after installation. In Remote SSH, verify that the
extension appears under **SSH: <host> — Installed**. If the installer cannot
find a compatible CLI, use **Extensions: Install from VSIX...** and choose the
path printed by the script.

Automatic profile routing is disabled by default. Click the Quota Pilot status
item and enable it independently for only the agents that should use it.

## Upgrade

Re-run the release installer with the new version, or pull the source checkout
and run `./scripts/install-local.sh` again. The backend install uses OpenClaw's
supported forced update path and the VSIX install uses `--force`.

## Verify

```bash
openclaw plugins inspect quota-pilot --runtime --json
openclaw gateway health
./scripts/smoke-test.sh
```

The smoke test rejects a Gateway response that contains common secret fields.

## Uninstall

```bash
./scripts/uninstall-local.sh
```

This uninstalls the VS Code extension and OpenClaw plugin, then restarts the
Gateway. Sanitized routing state is retained to make accidental uninstall and
reinstall recoverable. Remove that state manually only after identifying its
path from the plugin runtime on your own host.

## Rollback

Run the release installer with the previously working tag:

```bash
bash install-release.sh \
  --repo singledevai-droid/openclaw-quota-pilot \
  --version v0.3.6
```

Then reload VS Code. Release artifacts are immutable; do not reuse a published
tag for different contents.
