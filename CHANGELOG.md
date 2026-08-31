# Changelog

## Unreleased

- Generate operator-facing GitHub Release descriptions from every changelog
  section published since the previous tag instead of relying on GitHub's
  pull-request-only automatic notes.
- Document the current pinned installer version and make the release history
  easier to find from the README.

## 0.3.9 - 2026-08-31

- Replace the active profile's gray Quick Pick theme icon with a reliably
  colored green `✅` directly in the profile row label.
- Keep all inactive profile icons and the blue automatic-switching pause icon
  unchanged.
- Verify the release with 45 unit tests, type checking, plugin validation,
  privacy scanning, packaging, CI, and CodeQL.

## 0.3.8 - 2026-08-31

- Mark the active profile with a green dot and bold `ACTIVE` label in the
  status-bar hover card.
- Render the active profile's Quick Pick check icon with VS Code's passed-test
  green theme color.
- This theme-icon approach was superseded by 0.3.9 because VS Code Quick Pick
  rendered the requested color as gray.

## 0.3.7 - 2026-08-31

- Suppress the status-bar tooltip while the profile menu and its nested actions
  are open, preventing VS Code from reopening it when focus returns after a
  click.
- Restore the same tooltip after focus settles so it still appears on normal
  pointer hover.

## 0.3.6 - 2026-08-30

- Place the parent `auth --agent <id>` option before the `login` subcommand so
  OpenClaw accepts the generated OAuth command.
- Add a regression test that enforces the CLI option/subcommand ordering.

## 0.3.5 - 2026-08-30

- Turn clicks on expired OAuth profiles into a reauthorization action.
- Open a dedicated VS Code terminal and launch OpenClaw's OpenAI OAuth flow for
  the active agent and exact selected profile ID.
- Avoid provider-wide `--force`, preserving every other profile.
- Clearly tell the operator which OpenAI account must be selected in the
  browser because the provider OAuth page cannot force an email identity.
- Refresh the reauthorized route on successful command completion, even when a
  different agent terminal becomes active in the meantime.

## 0.3.4 - 2026-08-30

- Render the newly focused terminal's last sanitized quota snapshot immediately
  instead of waiting 5–10 seconds for a fresh Gateway CLI response.
- Persist agent discovery and per-route status snapshots in VS Code workspace
  state so instant switching survives window reloads.
- Refresh the focused agent and prefetch the other agents in the background.
- Keep a valid cached status visible if a silent background refresh fails.
- Key snapshots by both agent ID and session key to prevent cross-agent display.

## 0.3.3 - 2026-08-30

- Detect the active agent from the active terminal tab name before inspecting
  cwd, allowing `TG`, `Main`, and `WB` tabs that share the same parent folder.
- Scope manual agent overrides to the active terminal object instead of the
  entire VS Code window.
- Remove the obsolete 0.3.2 window-wide override during migration.
- Show whether an agent came from a terminal name, cwd, or workspace in the
  picker and display profile routing as `PROFILE AUTO` / `PROFILE FIXED` so it
  is not confused with agent detection.

## 0.3.2 - 2026-08-30

- Scope manual agent overrides to the current VS Code workspace window instead
  of sharing one global selection across every extension host.
- Keep global auto-detection enabled when an agent is selected manually and add
  a per-window action to resume detection.
- Fall back to the window workspace when the active terminal cwd is unavailable
  or does not belong to an agent workspace.
- Cache and coalesce agent discovery instead of repeating the slow CLI fallback
  on every picker click.
- Show notification progress while agents load, a window switches agents, or
  automatic detection resumes.

## 0.3.1 - 2026-08-30

- Automatically follow the agent mapped to the active integrated terminal cwd.
- Re-detect after terminal changes, shell integration activation, and completed shell commands.
- Added a menu/setting toggle with manual agent selection as the fallback.
- Return sanitized agent workspace paths for local cwd matching.
- Increased mutation calls to a 30-second minimum timeout and suppress background refresh while switching.
- Reuse the fresh quota cache during manual switching to eliminate redundant probes.
- Ignore stale status responses after the active terminal moves to another agent.

## 0.3.0 - 2026-08-30

- Added sanitized agent discovery through the read-only `quota-pilot.agents` RPC.
- Added an agent picker to the VS Code status-bar menu and command palette.
- Remember the last selected agent on the VS Code extension host.
- Show the selected agent in the status bar and each agent's assigned profile in the picker.
- Keep manual profile assignments and automatic mode independent per agent main session.

## 0.2.1 - 2026-08-29

- Read OpenClaw's effective runtime auth store, including inherited main profiles.
- Manual selection also updates the selected agent's auth order.
- Preserve per-session isolation: switching one agent never patches another agent.

## 0.2.0 - 2026-08-29

- Default and live quota refresh interval changed to 30 seconds.
- Refresh interval can be changed from the status-bar menu or VS Code settings.
- Custom per-profile labels can be edited from the menu or settings.
- Tooltip layout no longer uses compressed Markdown columns.
- Empty session key now follows the selected agent automatically.
- Runtime interval is persisted by the backend without a Gateway restart.

## 0.1.0 - 2026-08-29

- Initial OpenClaw quota backend.
- VS Code status bar and profile picker.
- Manual and automatic profile routing.
- Proactive reserve threshold and hysteresis.
- Sanitized quota RPC and local packaging workflow.
