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
  for (const entry of config.agents?.list ?? []) {
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
