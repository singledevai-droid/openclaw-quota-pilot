import { resolve, sep } from "node:path";

import type { AgentSummary } from "./types.js";

function normalized(value: string): string {
  const path = resolve(value);
  return process.platform === "win32" ? path.toLowerCase() : path;
}

function normalizedName(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-");
}

export function detectAgentFromTerminalName(
  agents: AgentSummary[],
  terminalName: string | undefined,
): AgentSummary | null {
  if (!terminalName?.trim()) return null;
  const candidate = normalizedName(terminalName);
  const exact = agents.find(
    (agent) =>
      normalizedName(agent.agentId) === candidate ||
      normalizedName(agent.label) === candidate,
  );
  if (exact) return exact;

  const prefixMatches = agents.filter(
    (agent) => normalizedName(agent.agentId).split("-")[0] === candidate,
  );
  return prefixMatches.length === 1 ? prefixMatches[0] ?? null : null;
}

export function detectAgentFromPath(
  agents: AgentSummary[],
  candidatePath: string | undefined,
): AgentSummary | null {
  if (!candidatePath?.trim()) return null;
  const candidate = normalized(candidatePath);
  return (
    agents
      .filter((agent): agent is AgentSummary & { workspaceDir: string } => {
        if (!agent.workspaceDir) return false;
        const workspace = normalized(agent.workspaceDir);
        return candidate === workspace || candidate.startsWith(`${workspace}${sep}`);
      })
      .sort(
        (left, right) =>
          normalized(right.workspaceDir).length - normalized(left.workspaceDir).length,
      )[0] ?? null
  );
}

export function detectAgentForWindow(
  agents: AgentSummary[],
  terminalPath: string | undefined,
  workspacePaths: string[],
  editorPath: string | undefined,
): AgentSummary | null {
  return (
    detectAgentFromPath(agents, terminalPath) ??
    workspacePaths
      .map((path) => detectAgentFromPath(agents, path))
      .find((agent): agent is AgentSummary => agent !== null) ??
    detectAgentFromPath(agents, editorPath)
  );
}

export function resolveAgentId(
  configuredAgentId: string,
  autoDetectAgent: boolean,
  detectedAgentId: string | null,
  manualOverrideAgentId: string | null,
): string {
  return (
    manualOverrideAgentId ??
    (autoDetectAgent ? detectedAgentId : null) ??
    configuredAgentId
  );
}
