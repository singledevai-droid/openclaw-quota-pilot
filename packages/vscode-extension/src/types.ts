export type QuotaWindow = {
  usedPercent: number | null;
  remainingPercent: number | null;
  resetAt: number | null;
  resetAfterSeconds: number | null;
  windowSeconds: number | null;
};

export type QuotaProfile = {
  profileId: string;
  label: string;
  email: string | null;
  provider: "openai";
  authStatus: "ok" | "expired" | "missing";
  tokenExpiresAt: number | null;
  plan: string | null;
  fiveHour: QuotaWindow | null;
  weekly: QuotaWindow | null;
  limitReached: boolean;
  usable: boolean;
  score: number | null;
  error: string | null;
  checkedAt: number;
  active: boolean;
  best: boolean;
};

export type PilotStatus = {
  version: string;
  mode: "manual" | "auto";
  routingMode: "pinned" | "auto" | "fallback";
  agentId: string;
  credentialOwnerAgentId?: string;
  sessionKey: string;
  activeProfileId: string | null;
  selectedProfileId: string | null;
  bestProfileId: string | null;
  reservePercent: number;
  switchHysteresisPercent: number;
  pollIntervalSeconds: number;
  profiles: QuotaProfile[];
  lastRefreshAt: number | null;
  lastSwitchAt: number | null;
  lastSwitchReason: string | null;
  warning: string | null;
};

export type SessionSummary = {
  agentId: string;
  sessionKey: string;
  kind: string;
  label: string | null;
  updatedAt: number | null;
  activeProfileId?: string | null;
  profileSource?: "pinned" | "auto" | "fallback";
};

export type AgentSummary = {
  agentId: string;
  label: string;
  sessionKey: string;
  workspaceDir?: string;
  activeProfileId: string | null;
  profileCount: number;
  mode: "manual" | "auto";
};

export type RouteTarget = {
  agentId: string;
  sessionKey: string;
};

export type ExtensionSettings = {
  openclawExecutable: string;
  agentId: string;
  sessionKey: string;
  pollIntervalSeconds: number;
  profileLabels: Record<string, string>;
  autoDetectAgent: boolean;
  gatewayTimeoutMs: number;
  showMode: boolean;
};
