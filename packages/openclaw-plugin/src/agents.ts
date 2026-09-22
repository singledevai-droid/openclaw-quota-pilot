import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";

export type AgentDescriptor = {
  agentId: string;
  label: string;
  sessionKey: string;
};

export function listConfiguredAgents(
  config: OpenClawPluginApi["config"],
  fallbackAgentId: string,
): AgentDescriptor[] {
  const seen = new Set<string>();
  const agents: AgentDescriptor[] = [];
  type AgentEntry = { id?: string; name?: string; identity?: { name?: string } };
  const agentConfig = config.agents as { entries?: Record<string, AgentEntry>; list?: AgentEntry[] } | undefined;
  // Modern entries take precedence over legacy list entries with the same ID.
  const entries = Object.entries(agentConfig?.entries ?? {}).map(([id, entry]) => ({ ...entry, id }));
  for (const entry of [...entries, ...(agentConfig?.list ?? [])]) {
    const agentId = entry.id?.trim();
    if (!agentId || seen.has(agentId)) continue;
    seen.add(agentId);
    const label =
      entry.identity?.name?.trim() || entry.name?.trim() || agentId;
    agents.push({ agentId, label, sessionKey: `agent:${agentId}:main` });
  }
  if (!seen.has(fallbackAgentId)) {
    agents.unshift({
      agentId: fallbackAgentId,
      label: fallbackAgentId,
      sessionKey: `agent:${fallbackAgentId}:main`,
    });
  }
  return agents;
}
