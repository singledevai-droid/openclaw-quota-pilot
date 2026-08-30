import type { PilotStatus, QuotaProfile, QuotaWindow } from "./types.js";

export function formatDuration(milliseconds: number): string {
  const totalMinutes = Math.max(0, Math.ceil(milliseconds / 60_000));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function formatWindow(
  shortLabel: string,
  window: QuotaWindow | null,
  now = Date.now(),
): string {
  if (!window || window.remainingPercent === null) return `${shortLabel} ?`;
  if (window.remainingPercent > 0) {
    return `${shortLabel} ${Math.round(window.remainingPercent)}%`;
  }
  return window.resetAt
    ? `${shortLabel} ↻${formatDuration(window.resetAt - now)}`
    : `${shortLabel} 0%`;
}

export function compactLabel(label: string, maximum = 26): string {
  if (label.length <= maximum) return label;
  return `${label.slice(0, Math.max(1, maximum - 1))}…`;
}

export function activeProfile(status: PilotStatus): QuotaProfile | null {
  return status.profiles.find((profile) => profile.active) ?? null;
}

export function applyProfileLabels(
  status: PilotStatus,
  labels: Record<string, string>,
): PilotStatus {
  return {
    ...status,
    profiles: status.profiles.map((profile) => ({
      ...profile,
      label: labels[profile.profileId]?.trim() || profile.label,
    })),
  };
}

export function formatStatusBar(status: PilotStatus, showMode: boolean): string {
  const profile = activeProfile(status);
  if (!profile) return `$(error) ${compactLabel(status.agentId, 16)}: no profile`;
  const parts = [
    `$(dashboard) ${compactLabel(status.agentId, 16)} · ${compactLabel(profile.label)}`,
    formatWindow("5h", profile.fiveHour),
    formatWindow("W", profile.weekly),
  ];
  if (showMode) {
    parts.push(status.mode === "auto" ? "PROFILE AUTO" : "PROFILE FIXED");
  }
  return parts.join(" · ");
}

function markdownEscape(value: string): string {
  return value.replace(/[|\\]/g, "\\$&");
}

function profileState(profile: QuotaProfile): string {
  if (profile.active) return "ACTIVE";
  if (profile.best) return "BEST";
  if (!profile.usable) return profile.error ?? "UNAVAILABLE";
  return "READY";
}

export function buildTooltipMarkdown(status: PilotStatus, now = Date.now()): string {
  const lines = [
    "### OpenClaw Quota Pilot",
    "",
    `Profile routing: **${status.mode === "auto" ? "AUTOMATIC" : "FIXED"}**  \\`,
    `Session: \`${status.sessionKey}\`  \\`,
    `Reserve: ${status.reservePercent}%`,
    `Agent: \`${status.agentId}\`  \\`,
    `Refresh: ${status.pollIntervalSeconds}s`,
    "",
  ];
  for (const profile of status.profiles) {
    lines.push(
      `**${markdownEscape(profile.label)}**`,
      `- 5-hour: ${formatWindow("", profile.fiveHour, now).trim()}`,
      `- Weekly: ${formatWindow("", profile.weekly, now).trim()}`,
      `- State: ${markdownEscape(profileState(profile))}`,
      "",
    );
  }
  if (status.warning) lines.push("", `$(warning) ${markdownEscape(status.warning)}`);
  if (status.lastRefreshAt) {
    lines.push("", `Updated: ${new Date(status.lastRefreshAt).toLocaleTimeString()}`);
  }
  lines.push("", "Click to manage profiles.");
  return lines.join("\n");
}

export function profileDetail(profile: QuotaProfile): string {
  if (!profile.usable) return profile.error ?? "Unavailable";
  return `${formatWindow("5h", profile.fiveHour)} · ${formatWindow("Week", profile.weekly)}`;
}
