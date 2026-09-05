import type { SessionSummary } from "./types.js";

type SessionInventory = {
  sessions?: unknown;
};

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function sessionKindFromKey(sessionKey: string): string {
  const parts = sessionKey.split(":");
  if (parts.includes("telegram")) return "telegram";
  if (parts.includes("cron")) return "automation";
  if (parts.includes("heartbeat")) return "heartbeat";
  if (parts.includes("subagent")) return "subagent";
  if (parts.at(-1) === "main") return "main";
  return "session";
}

export function parseSessionInventory(
  value: unknown,
  agentId: string,
): SessionSummary[] {
  const sessions = (value as SessionInventory | null)?.sessions;
  if (!Array.isArray(sessions)) return [];

  return sessions
    .flatMap((entry): SessionSummary[] => {
      if (!entry || typeof entry !== "object") return [];
      const record = entry as Record<string, unknown>;
      const sessionKey = stringValue(record.key);
      if (!sessionKey) return [];
      const entryAgentId = stringValue(record.agentId) ?? agentId;
      if (entryAgentId !== agentId) return [];
      const rawKind = stringValue(record.kind);
      const keyKind = sessionKindFromKey(sessionKey);
      const kind = keyKind !== "session"
        ? keyKind
        : rawKind === "cron" ? "automation" : rawKind ?? keyKind;
      if (!["main", "telegram", "automation", "heartbeat"].includes(kind)) {
        return [];
      }
      return [{
        agentId,
        sessionKey,
        kind,
        label: stringValue(record.label),
        updatedAt: numberValue(record.updatedAt),
      }];
    })
    .sort((left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0));
}
