# Architecture

```text
VS Code status bar
        |
        | openclaw gateway call (authenticated, local)
        v
Quota Pilot Gateway RPC
        |
        +-- sanitized configured-agent inventory
        +-- read-only SQLite credential inventory
        +-- GET chatgpt.com/backend-api/wham/usage
        +-- sanitized in-memory quota cache
        +-- 0600 routing-state file
        |
        +-- OpenClaw session patch API (profile selection)
        +-- openclaw models auth order (locked fallback order)
        v
OpenClaw Codex runtime
```

## Trust boundaries

The OpenClaw plugin is trusted local code because it must read OAuth access
tokens. The VS Code extension is untrusted with respect to credentials and
receives only sanitized quota data. It never reads OpenClaw configuration,
SQLite, environment credentials, or tokens.

## Shared profiles and agent isolation

Agent discovery reads configured IDs and display names from OpenClaw config and
returns no credentials. OpenClaw resolves each secondary agent's effective auth
store by merging its local profiles over the default/main agent's profiles.
Operators can therefore keep the canonical OAuth pool only in `main`; every
secondary agent inherits that pool without copying refresh tokens. A local
profile with the same ID overrides the inherited profile and should be avoided
when one shared pool is intended.

The backend reports `credentialOwnerAgentId` in every sanitized status result.
VS Code always launches profile-scoped OAuth against that owner (normally
`main`), even while displaying or routing a secondary agent. This prevents a
reauthorization from silently creating a newer local override in the active
secondary agent.

Routing state remains keyed by `agentId::sessionKey`, and the chosen
`authProfileOverride` is written only to that session. Assigning a shared
profile to `main` therefore cannot overwrite the assignment or mode for
`content-agent` or `support-agent`. OpenClaw's cross-agent OAuth refresh lock
serializes refreshes for a shared profile.

The agent inventory also returns sanitized workspace paths to the local VS Code
extension. The extension compares the active integrated terminal cwd against
those paths and changes only its current route target. It never reads terminal
commands, environment variables, OAuth state, or credentials.

## Request continuity

Automatic routing runs an awaited pre-dispatch quota check before OpenClaw
loads credentials for the next turn. Quota Pilot stores its chosen profile as
a hard session selection and records AUTO ownership separately in its routing
state. This avoids a split-brain state where the panel reports the plugin's
choice while OpenClaw replaces an `auto` session override during runtime
credential resolution.

The plugin also maintains an ordered OpenClaw auth profile list. Native
provider failover remains a secondary safeguard when OpenClaw classifies a
failure as retryable. If AUTO cannot verify the hard session selection before
dispatch, it stops the turn before any model request is sent.

Exact continuation from a provider's partially generated hidden state is not
possible. The provider does not expose a transferable continuation cursor.
Retries therefore replay the current turn from its persisted conversation
context. External tool calls should remain idempotent because any whole-turn
retry can otherwise repeat side effects.

## Ranking

The primary score is the profile's bottleneck quota:

```text
min(remaining 5-hour quota, remaining weekly quota)
```

Weekly and 5-hour remaining percentages break ties. OAuth-expired, exhausted,
and probe-failed profiles are placed after healthy profiles in OpenClaw's
fallback order.
