# OpenClaw Quota Pilot

Quota visibility and per-agent OpenAI profile routing for OpenClaw in VS Code.
Quota Pilot shows Codex limits in the status bar, follows the agent used by the
active terminal, and lets every agent keep an independent OAuth profile and
routing mode.

> [!IMPORTANT]
> Quota Pilot is an independent community project. It is not affiliated with,
> endorsed by, or supported by OpenAI or the OpenClaw project.

## Why Quota Pilot

Running several OpenClaw agents with several operator-owned OpenAI accounts is
hard to observe: quota lives outside VS Code, profile assignment is easy to
mix up, and an expired OAuth token interrupts the workflow. Quota Pilot puts
that control in one local status-bar menu without using an LLM.

## Features

- Displays remaining 5-hour and weekly Codex quota with reset countdowns.
- Discovers configured OpenClaw agents and shows the active agent in VS Code.
- Follows the active integrated terminal by terminal name, cwd, workspace, or
  active file, with an immediate cached status while fresh data loads.
- Keeps manual profile assignment and automatic routing independent per agent.
- Ranks healthy profiles by their weakest remaining quota window.
- Opens a dedicated terminal for profile-scoped OAuth reauthorization.
- Supports local profile aliases and a configurable 30–3600 second refresh.
- Makes no model calls for display, polling, discovery, or switching.
- Never returns OAuth tokens, refresh tokens, or account IDs to VS Code.

## Components

```text
VS Code extension
  └─ authenticated `openclaw gateway call`
       └─ OpenClaw Quota Pilot plugin
            ├─ read-only credential inventory
            ├─ OpenAI quota endpoint
            └─ OpenClaw session/profile APIs
```

The repository is a two-package npm workspace:

- `packages/openclaw-plugin` — trusted OpenClaw backend.
- `packages/vscode-extension` — workspace-side VS Code UI.

See [Architecture](docs/ARCHITECTURE.md) for trust boundaries and data flow.

## Requirements

- Linux host running OpenClaw `2026.7.1-2` or newer.
- Node.js `22.22.3` or newer.
- VS Code `1.95` or newer.
- The `openclaw` CLI available on the VS Code extension host.

With Remote SSH, install the VSIX on the remote extension host, not only on
your local desktop.

## Installation

### From a GitHub release

Download `install-release.sh` from this repository and run:

```bash
bash install-release.sh --repo singledevai-droid/openclaw-quota-pilot
```

The installer downloads the latest backend archive and VSIX, verifies their
SHA-256 checksums, installs the backend, restarts and checks the Gateway, then
installs the extension through the available VS Code CLI. If no CLI is found,
it prints the exact VSIX path for **Extensions: Install from VSIX...**.

### From source

```bash
git clone https://github.com/singledevai-droid/openclaw-quota-pilot.git
cd openclaw-quota-pilot
./scripts/install-local.sh
```

The source installer runs the complete verification suite before touching the
local OpenClaw installation. Automatic profile routing remains disabled after
installation until the operator enables it.

Read the detailed [installation and upgrade guide](docs/INSTALLATION.md).

## Usage

After installation, reload the VS Code window. The status bar looks like:

```text
$(dashboard) main · Work account · 5h 82% · W 37% · PROFILE FIXED
```

Click it to:

- choose or automatically follow an OpenClaw agent;
- refresh quota;
- assign that agent's profile;
- enable automatic profile routing for that agent;
- rename local profile labels;
- start OAuth reauthorization for an expired profile.

`PROFILE FIXED` and `PROFILE AUTO` describe profile routing, not agent
detection. A manual agent choice is scoped to the active terminal tab. Choose
**Resume automatic detection** to clear that terminal's override.

For reliable detection when several agents share the same parent folder, name
terminal tabs after an agent ID or a unique prefix (`TG` → `tg-growth`). The
extension then falls back to terminal cwd and the open workspace.

## Automatic routing

Automatic routing is opt-in. Quota Pilot excludes profiles with expired OAuth,
failed quota probes, or an exhausted window, then ranks candidates by:

1. Highest `min(5-hour remaining, weekly remaining)`.
2. Highest weekly remaining percentage.
3. Highest 5-hour remaining percentage.

It switches when the active profile reaches the configured reserve and a
candidate improves the bottleneck by at least the hysteresis threshold.
Defaults: 15% reserve and 5% hysteresis.

## OAuth reauthorization

An expired profile is marked **CLICK TO REAUTHORIZE**. Selecting it starts:

```text
openclaw models auth --agent <agent> login --provider openai --method oauth --profile-id <profile>
```

The OpenAI sign-in page cannot be forced to a specific email address. Sign in
to the exact account shown by Quota Pilot. The command is profile-scoped and
does not remove or overwrite other profiles.

## Configuration

Backend settings live under `plugins.entries.quota-pilot.config`; VS Code
settings use the `quotaPilot.*` namespace. See the complete
[configuration reference](docs/CONFIGURATION.md).

## Security and privacy

The backend must read local OAuth access tokens to request quota, so treat it
as trusted local code. Those tokens stay inside the OpenClaw host process and
are never included in Gateway RPC responses, logs, cache files, or VS Code
state. Profile identifiers may contain email addresses and should be redacted
from screenshots and issue reports.

Read [Security policy](SECURITY.md) before reporting a vulnerability or
changing credential access.

## Development

```bash
npm ci
npm run verify
```

`npm run verify` runs the privacy scan, type checks, 45 unit tests, plugin
validation, and both packaging jobs. Release artifacts are written to
`artifacts/`.

See [Contributing](CONTRIBUTING.md), [release process](docs/RELEASING.md), and
the [changelog](CHANGELOG.md).

## Uninstall

From a source checkout:

```bash
./scripts/uninstall-local.sh
```

The command removes both installed components but intentionally retains the
sanitized local routing state. See [Installation](docs/INSTALLATION.md) for the
manual cleanup option.

## License

[MIT](LICENSE)
