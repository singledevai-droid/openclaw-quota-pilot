# Quota Pilot — next update

## OpenClaw agent inventory compatibility (2026-09-22)

- Support current `agents.entries` keyed by agent ID as well as legacy
  `agents.list`; deduplicate IDs with explicit precedence.
- Preserve per-agent names, workspaces and session selection. Do not silently
  change PINNED/AUTO or force all agents onto the main session's profile.
- Check discovery, status, AUTO dispatch hooks and session routing for every
  configured agent, including scheduled sessions.
- Distinguish configured/selected profile from effective runtime authorization
  and indicate pending switches instead of claiming live routing is confirmed.
- Add regression coverage for entries-only, list-only and mixed configuration.
- Live acceptance: the plugin discovers all three configured agents on the validation host;
  each displayed profile agrees with its runtime auth after a completed switch.

Evidence: on 2026-09-22 `quota-pilot.agents` returned only main while config had
three agents under `agents.entries`. `listConfiguredAgents` only read
`config.agents.list`. Other sessions reported different runtime profiles.

Status: implemented in v0.3.17 (2026-09-22).

Acceptance:
- Modern entries, legacy list, mixed precedence: regression tests pass.
- AUTO and manual selection use verified host session patches, not nested
  auth-order CLI processes; session discovery also uses the host API.
- All three configured agents are discovered live. Refresh succeeds with no
  warning; existing PINNED/AUTO modes preserved. Session inventory is usable.
- Live growth-agent probe completed with QUOTA_PILOT_OK on the requested model,
  without rerouting; no outbound Telegram delivery was requested.
- Backend and VS Code package v0.3.17 installed; 89 unit tests and release gates
  pass. VS Code window reload is required to activate the new frontend.
- Runtime evidence is explicit: recorded CLI binding when available, otherwise
  unverified. This gateway does not expose such binding in these rows; do not
  treat selectedProfileId or lastGood as proof of per-request billing.

Follow-up: a supported native-runtime credential receipt API would allow the
UI to confirm per-request account usage beyond recorded CLI bindings. Until
available the UI deliberately shows unverified, not an invented effective ID.
