# OpenClaw Quota Pilot for VS Code

Workspace-side status bar for the `openclaw-quota-pilot` OpenClaw plugin.

Install the OpenClaw backend first. Then install this VSIX on the machine or
Remote SSH extension host where the `openclaw` CLI is available. Click the
status item to choose an OpenClaw agent, refresh quota, assign that agent's
OAuth profile, or enable automatic routing independently for that agent.
By default the extension follows the active integrated terminal. It first
matches the terminal name to an agent ID or unique prefix, then falls back to
the terminal cwd, open workspace, and active editor. Manual agent selection is
scoped to the active terminal tab.

No LLM call is made by this extension.
