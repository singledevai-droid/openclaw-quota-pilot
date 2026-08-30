export type WindowKind = "fiveHour" | "weekly";

export type QuotaWindow = {
  usedPercent: number | null;
  remainingPercent: number | null;
  resetAt: number | null;
  resetAfterSeconds: number | null;
  windowSeconds: number | null;
};

export type CredentialRecord = {
  profileId: string;
  provider: "openai";
  email: string | null;
  accessToken: string;
  accountId: string | null;
  expiresAt: number | null;
  planHint: string | null;
};

export type CredentialInventory = {
  profiles: CredentialRecord[];
  configuredOrder: string[];
  lastGoodProfileId: string | null;
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
};

export type RouteTarget = {
  agentId: string;
  sessionKey: string;
};

export type RouteState = RouteTarget & {
  autoEnabled: boolean;
  manualProfileId: string | null;
  lastSwitchAt: number | null;
  lastSwitchReason: string | null;
};

export type PersistedState = {
  version: 1;
  pollIntervalSeconds?: number;
  routes: Record<string, RouteState>;
};

export type PilotConfig = {
  agentId: string;
  sessionKey: string;
  pollIntervalSeconds: number;
  reservePercent: number;
  switchHysteresisPercent: number;
  requestTimeoutMs: number;
  autoEnabledByDefault: boolean;
  openclawExecutable: string;
  profileAliases: Record<string, string>;
};

export type RoutingDecision = {
  shouldSwitch: boolean;
  selectedProfileId: string | null;
  orderedProfileIds: string[];
  reason: string;
};

export type PilotStatus = {
  version: string;
  mode: "manual" | "auto";
  agentId: string;
  sessionKey: string;
  activeProfileId: string | null;
  selectedProfileId: string | null;
  bestProfileId: string | null;
  reservePercent: number;
  switchHysteresisPercent: number;
  pollIntervalSeconds: number;
  profiles: Array<QuotaProfile & { active: boolean; best: boolean }>;
  lastRefreshAt: number | null;
  lastSwitchAt: number | null;
  lastSwitchReason: string | null;
  warning: string | null;
};

export type AgentSummary = {
  agentId: string;
  label: string;
  sessionKey: string;
  workspaceDir: string;
  activeProfileId: string | null;
  profileCount: number;
  mode: "manual" | "auto";
};

export type PluginLoggerLike = {
  debug?: (message: string, meta?: Record<string, unknown>) => void;
  info: (message: string, meta?: Record<string, unknown>) => void;
  warn: (message: string, meta?: Record<string, unknown>) => void;
  error: (message: string, meta?: Record<string, unknown>) => void;
};
