import * as vscode from "vscode";

import {
  detectAgentForWindow,
  detectAgentFromPath,
  detectAgentFromTerminalName,
  resolveAgentId,
} from "./agent-detection.js";
import { OpenClawClient } from "./openclaw-client.js";
import { buildOAuthLoginCommand } from "./oauth-command.js";
import { profileQuickPickLabel } from "./quick-pick-format.js";
import {
  cachedStatusForTarget,
  restoreStatusCache,
  STATUS_CACHE_SCHEMA_VERSION,
  statusCacheKey,
  targetCacheKey,
} from "./status-cache.js";
import { StatusBarTooltipController } from "./status-bar-tooltip.js";
import {
  activeProfile,
  applyProfileLabels,
  buildTooltipMarkdown,
  formatStatusBar,
  profileDetail,
} from "./format.js";
import type {
  AgentSummary,
  ExtensionSettings,
  PilotStatus,
  QuotaProfile,
  RouteTarget,
} from "./types.js";

type PilotQuickPickItem = vscode.QuickPickItem & {
  action:
    | "select-agent"
    | "resume-agent-detection"
    | "toggle-agent-detection"
    | "refresh"
    | "toggle-auto"
    | "set-interval"
    | "rename-profile"
    | "profile";
  profileId?: string;
};

function profileQuickPickIcon(profile: QuotaProfile): vscode.ThemeIcon {
  return new vscode.ThemeIcon(profile.usable ? "account" : "error");
}

function profileLabels(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] =>
        entry[0].trim().length > 0 &&
        typeof entry[1] === "string" &&
        entry[1].trim().length > 0,
    ),
  );
}

function settings(): ExtensionSettings {
  const config = vscode.workspace.getConfiguration("quotaPilot");
  const agentId = config.get<string>("agentId", "main").trim() || "main";
  return {
    openclawExecutable:
      config.get<string>("openclawExecutable", "openclaw").trim() || "openclaw",
    agentId,
    sessionKey: config.get<string>("sessionKey", "").trim(),
    pollIntervalSeconds: Math.max(
      30,
      Math.min(3600, config.get<number>("pollIntervalSeconds", 30)),
    ),
    profileLabels: profileLabels(config.get<Record<string, string>>("profileLabels", {})),
    autoDetectAgent: config.get<boolean>("autoDetectAgent", true),
    gatewayTimeoutMs: Math.max(
      2000,
      Math.min(60000, config.get<number>("gatewayTimeoutMs", 30000)),
    ),
    showMode: config.get<boolean>("showMode", true),
  };
}

function toQuickPickItems(
  status: PilotStatus,
  autoDetectAgent: boolean,
  detectedAgentId: string | null,
  manualOverrideAgentId: string | null,
  activeTerminalName: string | null,
  detectionSource: string | null,
): PilotQuickPickItem[] {
  const modeAction: PilotQuickPickItem = {
    label:
      status.mode === "auto"
        ? "$(debug-pause) Disable automatic switching"
        : "$(play) Enable automatic switching",
    description: `Reserve ${status.reservePercent}%`,
    action: "toggle-auto",
  };
  const profiles = status.profiles.map<PilotQuickPickItem>((profile) => ({
    label: profileQuickPickLabel(profile),
    ...(!profile.active ? { iconPath: profileQuickPickIcon(profile) } : {}),
    description: [
      profile.active ? "ACTIVE" : null,
      profile.best ? "BEST" : null,
      profile.authStatus === "expired" ? "CLICK TO REAUTHORIZE" : null,
      !profile.usable && profile.authStatus !== "expired" ? "UNAVAILABLE" : null,
      profile.plan?.toUpperCase() ?? null,
    ]
      .filter(Boolean)
      .join(" · "),
    detail: profileDetail(profile),
    action: "profile",
    profileId: profile.profileId,
  }));
  return [
    {
      label: `$(robot) Agent: ${status.agentId}`,
      description:
        manualOverrideAgentId === status.agentId
          ? `LOCKED · terminal ${activeTerminalName ?? "window"}`
          : detectedAgentId === status.agentId
            ? `AUTO · ${detectionSource ?? "detected"}`
            : "Configured fallback",
      action: "select-agent",
    },
    manualOverrideAgentId
      ? {
          label: `$(location) Resume automatic detection for ${
            activeTerminalName ? `terminal ${activeTerminalName}` : "this window"
          }`,
          description: detectedAgentId
            ? `Detected: ${detectedAgentId}`
            : "Use the active terminal name, cwd, or workspace",
          action: "resume-agent-detection",
        }
      : {
          label: autoDetectAgent
            ? "$(location) Disable automatic agent detection"
            : "$(location) Enable automatic agent detection",
          description: autoDetectAgent ? "ON" : "OFF",
          action: "toggle-agent-detection",
        },
    {
      label: "$(refresh) Refresh quota now",
      ...(status.lastRefreshAt
        ? {
            description: `Updated ${new Date(status.lastRefreshAt).toLocaleTimeString()}`,
          }
        : {}),
      action: "refresh",
    },
    modeAction,
    {
      label: "$(clock) Change refresh interval",
      description: `Every ${status.pollIntervalSeconds}s`,
      action: "set-interval",
    },
    {
      label: "$(edit) Rename a profile",
      description: "Add or change a local label",
      action: "rename-profile",
    },
    ...profiles,
  ];
}

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel("OpenClaw Quota Pilot");
  const item = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100,
  );
  item.name = "OpenClaw Quota Pilot";
  item.command = "quotaPilot.showMenu";
  item.text = "$(loading~spin) Quota Pilot";
  item.tooltip = "Loading OpenClaw quota…";
  item.show();
  const tooltipController = new StatusBarTooltipController(item);

  const client = new OpenClawClient(settings, output);
  const terminalOverrides = new WeakMap<vscode.Terminal, string>();
  const oauthTerminals = new WeakMap<vscode.Terminal, RouteTarget>();
  let windowOverrideAgentId: string | null = null;
  let detectedAgentId: string | null = null;
  let detectionSource: string | null = null;
  let agentsCache =
    context.workspaceState.get<AgentSummary[]>("quotaPilot.agentsCache") ?? null;
  let agentsRequest: Promise<AgentSummary[]> | null = null;
  let latestStatus: PilotStatus | null = null;
  const statusCache = restoreStatusCache(
    context.workspaceState.get<Record<string, PilotStatus>>(
      "quotaPilot.statusCache",
      {},
    ),
    context.workspaceState.get<number>("quotaPilot.statusCacheSchemaVersion"),
  );
  void context.workspaceState.update(
    "quotaPilot.statusCacheSchemaVersion",
    STATUS_CACHE_SCHEMA_VERSION,
  );
  let timer: NodeJS.Timeout | null = null;
  let mutationInFlight = false;
  const updatesInFlight = new Map<string, Promise<PilotStatus | null>>();

  // 0.3.2 stored one override for the whole VS Code window. It cannot represent
  // several agent terminals in one window, so discard it during migration.
  void context.workspaceState.update("quotaPilot.manualAgentOverride", undefined);

  const manualOverrideAgentId = (): string | null => {
    const terminal = vscode.window.activeTerminal;
    return terminal
      ? terminalOverrides.get(terminal) ?? null
      : windowOverrideAgentId;
  };

  const effectiveAgentId = (): string => {
    const configured = settings();
    return resolveAgentId(
      configured.agentId,
      configured.autoDetectAgent,
      detectedAgentId,
      manualOverrideAgentId(),
    );
  };

  const currentTarget = (): RouteTarget => {
    const configured = settings();
    const agentId = effectiveAgentId();
    return {
      agentId,
      sessionKey:
        agentId === configured.agentId && configured.sessionKey
          ? configured.sessionKey
          : `agent:${agentId}:main`,
    };
  };

  const persistStatusCache = (): void => {
    void context.workspaceState.update(
      "quotaPilot.statusCache",
      Object.fromEntries(statusCache),
    );
  };

  const cacheStatus = (status: PilotStatus): void => {
    statusCache.set(statusCacheKey(status), status);
    persistStatusCache();
  };

  const applyStatus = (rawStatus: PilotStatus): PilotStatus => {
    cacheStatus(rawStatus);
    const status = applyProfileLabels(rawStatus, settings().profileLabels);
    latestStatus = status;
    item.text = formatStatusBar(status, settings().showMode);
    const tooltip = new vscode.MarkdownString(buildTooltipMarkdown(status));
    tooltip.isTrusted = false;
    tooltipController.update(tooltip);

    const active = activeProfile(status);
    if (!active || !active.usable) {
      item.backgroundColor = new vscode.ThemeColor("statusBarItem.errorBackground");
    } else {
      const bottleneck = Math.min(
        active.fiveHour?.remainingPercent ?? 100,
        active.weekly?.remainingPercent ?? 100,
      );
      item.backgroundColor =
        bottleneck <= status.reservePercent
          ? new vscode.ThemeColor("statusBarItem.warningBackground")
          : undefined;
    }
    return status;
  };

  const applyCachedStatusForCurrentTarget = (): boolean => {
    const target = currentTarget();
    const cached = cachedStatusForTarget(statusCache, target);
    if (!cached) {
      latestStatus = null;
      item.text = `$(loading~spin) ${target.agentId}`;
      tooltipController.update(`Loading quota for ${target.agentId}…`);
      item.backgroundColor = undefined;
      return false;
    }
    applyStatus(cached);
    return true;
  };

  const refreshOAuthTarget = async (target: RouteTarget): Promise<void> => {
    try {
      const status = await client.status(target, true);
      if (targetCacheKey(currentTarget()) === targetCacheKey(target)) {
        applyStatus(status);
      } else {
        cacheStatus(status);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      output.appendLine(`[${new Date().toISOString()}] OAuth refresh failed: ${message}`);
      void vscode.window.showErrorMessage(
        `Quota Pilot: OAuth finished, but profile refresh failed: ${message}`,
      );
    }
  };

  const applyError = (error: unknown, notify: boolean): void => {
    const message = error instanceof Error ? error.message : String(error);
    output.appendLine(`[${new Date().toISOString()}] ERROR ${message}`);
    item.text = "$(error) Quota Pilot";
    tooltipController.update(
      `${message}\n\nOpen the OpenClaw Quota Pilot output for details.`,
    );
    item.backgroundColor = new vscode.ThemeColor("statusBarItem.errorBackground");
    if (notify) void vscode.window.showErrorMessage(`Quota Pilot: ${message}`);
  };

  const update = (force: boolean, notify = false): Promise<PilotStatus | null> => {
    const target = currentTarget();
    const key = targetCacheKey(target);
    const existing = updatesInFlight.get(key);
    if (existing) return existing;
    const request = client
      .status(target, force)
      .then((status) => {
        if (targetCacheKey(currentTarget()) === key) return applyStatus(status);
        cacheStatus(status);
        return null;
      })
      .catch((error: unknown) => {
        if (
          targetCacheKey(currentTarget()) === key &&
          (notify || !statusCache.has(key))
        ) {
          applyError(error, notify);
        }
        return null;
      })
      .finally(() => {
        if (updatesInFlight.get(key) === request) updatesInFlight.delete(key);
      });
    updatesInFlight.set(key, request);
    return request;
  };

  const waitForCurrentUpdate = async (): Promise<void> => {
    const pending = updatesInFlight.get(targetCacheKey(currentTarget()));
    if (pending) await pending;
  };

  const resetTimer = (): void => {
    if (timer) clearInterval(timer);
    timer = setInterval(() => {
      if (!mutationInFlight) void update(false);
    }, settings().pollIntervalSeconds * 1000);
    timer.unref();
  };

  const runMutation = async <T>(operation: () => Promise<T>): Promise<T> => {
    mutationInFlight = true;
    await waitForCurrentUpdate();
    try {
      return await operation();
    } finally {
      mutationInFlight = false;
    }
  };

  const selectProfile = async (profile?: QuotaProfile): Promise<void> => {
    const status = latestStatus ?? (await update(false, true));
    if (!status) return;
    let selected = profile;
    if (!selected) {
      const choices = status.profiles.map((candidate) => ({
        label: profileQuickPickLabel(candidate),
        ...(!candidate.active
          ? { iconPath: profileQuickPickIcon(candidate) }
          : {}),
        description: candidate.active
          ? "ACTIVE"
          : candidate.authStatus === "expired"
            ? "REAUTHORIZE"
          : candidate.best
            ? "BEST"
            : candidate.usable
              ? "READY"
              : "UNAVAILABLE",
        detail: profileDetail(candidate),
        profile: candidate,
      }));
      selected = (await vscode.window.showQuickPick(choices, {
        title: "Select OpenClaw OpenAI profile",
        placeHolder:
          "Choose a ready profile, or click an expired profile to reauthorize it",
      }))?.profile;
    }
    if (!selected) return;
    if (selected.authStatus === "expired" || selected.error === "oauth-token-expired") {
      const target = currentTarget();
      const command = buildOAuthLoginCommand(
        settings().openclawExecutable,
        target.agentId,
        selected.profileId,
      );
      const workspaceDir = agentsCache?.find(
        (agent) => agent.agentId === target.agentId,
      )?.workspaceDir;
      const terminal = vscode.window.createTerminal({
        name: `OAuth · ${selected.label}`,
        ...(workspaceDir ? { cwd: workspaceDir } : {}),
        message: `Reauthorizing ${selected.label} for agent ${target.agentId}. Sign in to this exact OpenAI account in the browser.`,
      });
      oauthTerminals.set(terminal, target);
      terminal.show(true);
      terminal.sendText(command, true);
      void vscode.window.showInformationMessage(
        `Quota Pilot: OAuth started for ${selected.label} (${target.agentId}). Sign in to that exact account.`,
      );
      return;
    }
    if (selected.active) return;
    if (!selected.usable) {
      void vscode.window.showWarningMessage(
        `Quota Pilot: ${selected.label} is unavailable${
          selected.error ? ` (${selected.error})` : ""
        }.`,
      );
      return;
    }
    try {
      item.text = "$(loading~spin) Switching OpenAI profile…";
      applyStatus(
        await runMutation(() =>
          client.switchProfile(currentTarget(), selected.profileId),
        ),
      );
      void vscode.window.showInformationMessage(
        `Quota Pilot switched to ${selected.label}. Automatic routing is off.`,
      );
    } catch (error) {
      applyError(error, true);
      await update(false);
    }
  };

  const toggleAuto = async (): Promise<void> => {
    const status = latestStatus ?? (await update(false, true));
    if (!status) return;
    try {
      item.text = "$(loading~spin) Updating routing mode…";
      const next = await runMutation(() =>
        client.setAutomaticMode(currentTarget(), status.mode !== "auto"),
      );
      applyStatus(next);
      void vscode.window.showInformationMessage(
        `Quota Pilot automatic routing ${next.mode === "auto" ? "enabled" : "disabled"}.`,
      );
    } catch (error) {
      applyError(error, true);
      await update(false);
    }
  };

  const renameProfile = async (): Promise<void> => {
    const status = latestStatus ?? (await update(false, true));
    if (!status) return;
    const choice = await vscode.window.showQuickPick(
      status.profiles.map((profile) => ({
        label: profile.label,
        description: profile.active ? "ACTIVE" : profile.best ? "BEST" : "",
        detail: profile.profileId,
        profile,
      })),
      { title: "Choose a profile to rename" },
    );
    if (!choice) return;
    const value = await vscode.window.showInputBox({
      title: `Label for ${choice.profile.label}`,
      value: settings().profileLabels[choice.profile.profileId] ?? "",
      prompt: "Enter a custom label. Leave empty to restore the original name.",
      validateInput: (input) =>
        input.trim().length > 80 ? "The label must be 80 characters or fewer" : undefined,
    });
    if (value === undefined) return;
    const labels = { ...settings().profileLabels };
    if (value.trim()) labels[choice.profile.profileId] = value.trim();
    else delete labels[choice.profile.profileId];
    await vscode.workspace
      .getConfiguration("quotaPilot")
      .update("profileLabels", labels, vscode.ConfigurationTarget.Global);
    await update(true, true);
  };

  const changePollInterval = async (): Promise<void> => {
    const presets = [30, 60, 120, 300, 600].map((seconds) => ({
      label: seconds < 60 ? `${seconds} seconds` : `${seconds / 60} minute${seconds === 60 ? "" : "s"}`,
      seconds,
    }));
    const choice = await vscode.window.showQuickPick(
      [...presets, { label: "Custom…", seconds: 0 }],
      { title: "Quota refresh interval" },
    );
    if (!choice) return;
    let seconds = choice.seconds;
    if (seconds === 0) {
      const raw = await vscode.window.showInputBox({
        title: "Custom refresh interval",
        prompt: "Enter seconds from 30 to 3600",
        value: String(settings().pollIntervalSeconds),
        validateInput: (input) => {
          const parsed = Number(input);
          return Number.isInteger(parsed) && parsed >= 30 && parsed <= 3600
            ? undefined
            : "Enter an integer from 30 to 3600";
        },
      });
      if (raw === undefined) return;
      seconds = Number(raw);
    }
    const next = await runMutation(() =>
      client.setPollInterval(currentTarget(), seconds),
    );
    await vscode.workspace
      .getConfiguration("quotaPilot")
      .update("pollIntervalSeconds", seconds, vscode.ConfigurationTarget.Global);
    resetTimer();
    applyStatus(next);
  };

  const loadAgents = async (force = false): Promise<AgentSummary[]> => {
    if (agentsCache && !force) return agentsCache;
    if (agentsRequest && !force) return agentsRequest;
    const request = client
      .agents()
      .then((agents) => {
        agentsCache = agents;
        void context.workspaceState.update("quotaPilot.agentsCache", agents);
        return agents;
      })
      .finally(() => {
        if (agentsRequest === request) agentsRequest = null;
      });
    agentsRequest = request;
    return request;
  };

  const terminalCwd = (terminal: vscode.Terminal | undefined): string | undefined => {
    const integrated = terminal?.shellIntegration?.cwd?.fsPath;
    if (integrated) return integrated;
    const configured = (
      terminal?.creationOptions as {
        cwd?: string | vscode.Uri | vscode.WorkspaceFolder;
      }
    )?.cwd;
    if (typeof configured === "string") return configured;
    if (configured && "fsPath" in configured) return configured.fsPath;
    if (configured && "uri" in configured) return configured.uri.fsPath;
    return undefined;
  };

  const detectCurrentAgent = async (refreshStatus: boolean): Promise<void> => {
    if (!settings().autoDetectAgent) return;
    const agents = await loadAgents();
    const activeTerminal = vscode.window.activeTerminal;
    const terminalPath = terminalCwd(activeTerminal);
    const byTerminalName = detectAgentFromTerminalName(
      agents,
      activeTerminal?.name,
    );
    const byTerminalPath = detectAgentFromPath(agents, terminalPath);
    const byWindow = detectAgentForWindow(
      agents,
      undefined,
      vscode.workspace.workspaceFolders?.map((folder) => folder.uri.fsPath) ?? [],
      vscode.window.activeTextEditor?.document.uri.fsPath,
    );
    const detected =
      byTerminalName ??
      byTerminalPath ??
      byWindow;
    const nextSource = byTerminalName
      ? `terminal name “${activeTerminal?.name}”`
      : byTerminalPath
        ? `terminal cwd ${terminalPath}`
        : byWindow
          ? "window workspace/editor"
          : null;
    const nextAgentId = detected?.agentId ?? null;
    if (nextAgentId === detectedAgentId && nextSource === detectionSource) {
      if (refreshStatus && latestStatus?.agentId !== effectiveAgentId()) {
        latestStatus = null;
        await update(false);
      }
      return;
    }
    detectedAgentId = nextAgentId;
    detectionSource = nextSource;
    output.appendLine(
      `[${new Date().toISOString()}] agent detection: ${
        detectedAgentId ?? "no workspace match; using configured fallback"
      }${activeTerminal ? ` terminal=${activeTerminal.name}` : ""}${
        terminalPath ? ` cwd=${terminalPath}` : ""
      }${detectionSource ? ` source=${detectionSource}` : ""}`,
    );
    applyCachedStatusForCurrentTarget();
    if (refreshStatus) void update(false);
  };

  const resumeAgentDetection = async (): Promise<void> => {
    const activeTerminal = vscode.window.activeTerminal;
    if (activeTerminal) terminalOverrides.delete(activeTerminal);
    else windowOverrideAgentId = null;
    item.text = "$(loading~spin) Detecting agent…";
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Quota Pilot: detecting the agent for ${
          activeTerminal ? `terminal ${activeTerminal.name}` : "this window"
        }…`,
      },
      async () => {
        await detectCurrentAgent(false);
        await update(false, true);
      },
    );
    void vscode.window.showInformationMessage(
      `Quota Pilot: automatic agent detection resumed for ${
        activeTerminal ? `terminal ${activeTerminal.name}` : "this window"
      }.`,
    );
  };

  const toggleAgentDetection = async (): Promise<void> => {
    const enabled = !settings().autoDetectAgent;
    await vscode.workspace
      .getConfiguration("quotaPilot")
      .update("autoDetectAgent", enabled, vscode.ConfigurationTarget.Global);
    detectedAgentId = null;
    detectionSource = null;
    agentsCache = null;
    await context.workspaceState.update("quotaPilot.agentsCache", undefined);
    latestStatus = null;
    if (enabled) await detectCurrentAgent(false);
    await update(false, true);
  };

  const selectAgent = async (): Promise<void> => {
    let agents: AgentSummary[];
    try {
      agents = agentsCache ??
        (await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: "Quota Pilot: loading agents…",
          },
          () => loadAgents(),
        ));
    } catch (error) {
      applyError(error, true);
      return;
    }
    const choice = await vscode.window.showQuickPick(
      agents.map((agent) => ({
        label: `${agent.agentId === effectiveAgentId() ? "$(check)" : "$(robot)"} ${agent.label}`,
        description: [
          agent.agentId,
          agent.mode.toUpperCase(),
          `${agent.profileCount} profile${agent.profileCount === 1 ? "" : "s"}`,
        ].join(" · "),
        detail: agent.activeProfileId
          ? `Assigned: ${
              settings().profileLabels[agent.activeProfileId] ??
              agent.activeProfileId.replace(/^openai:/, "")
            }`
          : "No OpenAI profile assigned",
        agent,
      })),
      {
        title: "Select OpenClaw agent",
        placeHolder: "Each agent keeps its own profile and routing mode",
        matchOnDescription: true,
        matchOnDetail: true,
      },
    );
    if (!choice) return;
    const activeTerminal = vscode.window.activeTerminal;
    if (activeTerminal) terminalOverrides.set(activeTerminal, choice.agent.agentId);
    else windowOverrideAgentId = choice.agent.agentId;
    applyCachedStatusForCurrentTarget();
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Quota Pilot: assigning ${choice.agent.label} to ${
          activeTerminal ? `terminal ${activeTerminal.name}` : "this window"
        }…`,
      },
      async () => {
        await update(false, true);
      },
    );
    void vscode.window.showInformationMessage(
      `Quota Pilot: ${choice.agent.label} is selected for ${
        activeTerminal ? `terminal ${activeTerminal.name}` : "this window"
      }.`,
    );
  };

  const showMenu = async (): Promise<void> => {
    tooltipController.suppressDuringInteraction();
    try {
      const status = latestStatus ?? (await update(false, true));
      if (!status) return;
      const selection = await vscode.window.showQuickPick(
        toQuickPickItems(
          status,
          settings().autoDetectAgent,
          detectedAgentId,
          manualOverrideAgentId(),
          vscode.window.activeTerminal?.name ?? null,
          detectionSource,
        ),
        {
          title: `OpenClaw Quota Pilot · ${status.mode.toUpperCase()}`,
          placeHolder: "Select an agent, change mode, or assign a profile",
          matchOnDescription: true,
          matchOnDetail: true,
        },
      );
      if (!selection) return;
      if (selection.action === "select-agent") {
        await selectAgent();
      } else if (selection.action === "resume-agent-detection") {
        await resumeAgentDetection();
      } else if (selection.action === "toggle-agent-detection") {
        await toggleAgentDetection();
      } else if (selection.action === "refresh") {
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: "Refreshing OpenAI quota",
          },
          async () => {
            await update(true, true);
          },
        );
      } else if (selection.action === "toggle-auto") {
        await toggleAuto();
      } else if (selection.action === "set-interval") {
        await changePollInterval();
      } else if (selection.action === "rename-profile") {
        await renameProfile();
      } else if (selection.profileId) {
        const selected = status.profiles.find(
          (profile) => profile.profileId === selection.profileId,
        );
        if (selected) await selectProfile(selected);
      }
    } finally {
      tooltipController.restoreAfterInteraction();
    }
  };

  context.subscriptions.push(
    item,
    output,
    vscode.commands.registerCommand("quotaPilot.showMenu", showMenu),
    vscode.commands.registerCommand("quotaPilot.refresh", () => update(true, true)),
    vscode.commands.registerCommand("quotaPilot.toggleAuto", toggleAuto),
    vscode.commands.registerCommand("quotaPilot.selectAgent", selectAgent),
    vscode.commands.registerCommand(
      "quotaPilot.toggleAgentDetection",
      toggleAgentDetection,
    ),
    vscode.commands.registerCommand("quotaPilot.selectProfile", () => selectProfile()),
    vscode.commands.registerCommand("quotaPilot.renameProfile", renameProfile),
    vscode.commands.registerCommand("quotaPilot.changePollInterval", changePollInterval),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (!event.affectsConfiguration("quotaPilot")) return;
      resetTimer();
      if (event.affectsConfiguration("quotaPilot.pollIntervalSeconds")) {
        void client
          .setPollInterval(currentTarget(), settings().pollIntervalSeconds)
          .then(applyStatus)
          .catch((error: unknown) => applyError(error, true));
      } else if (event.affectsConfiguration("quotaPilot.autoDetectAgent")) {
        detectedAgentId = null;
        agentsCache = null;
        latestStatus = null;
        void detectCurrentAgent(false).then(() => update(false, true));
      } else {
        void update(true, true);
      }
    }),
    vscode.window.onDidChangeActiveTerminal(() => {
      void detectCurrentAgent(true).catch((error: unknown) => applyError(error, false));
    }),
    vscode.window.onDidChangeTerminalShellIntegration((event) => {
      if (event.terminal !== vscode.window.activeTerminal) return;
      void detectCurrentAgent(true).catch((error: unknown) => applyError(error, false));
    }),
    vscode.window.onDidChangeTerminalState((terminal) => {
      if (terminal !== vscode.window.activeTerminal) return;
      void detectCurrentAgent(true).catch((error: unknown) => applyError(error, false));
    }),
    vscode.window.onDidEndTerminalShellExecution((event) => {
      const oauthTarget = oauthTerminals.get(event.terminal);
      if (oauthTarget) {
        oauthTerminals.delete(event.terminal);
        if (event.exitCode === 0) {
          void vscode.window.showInformationMessage(
            "Quota Pilot: OAuth command completed. Refreshing the profile…",
          );
          void refreshOAuthTarget(oauthTarget);
        } else {
          void vscode.window.showWarningMessage(
            `Quota Pilot: OAuth command exited with code ${event.exitCode ?? "unknown"}. Check the terminal output.`,
          );
        }
        return;
      }
      if (event.terminal !== vscode.window.activeTerminal) return;
      void detectCurrentAgent(true).catch((error: unknown) => applyError(error, false));
    }),
    vscode.window.onDidCloseTerminal((terminal) => {
      const oauthTarget = oauthTerminals.get(terminal);
      if (!oauthTarget) return;
      oauthTerminals.delete(terminal);
      void refreshOAuthTarget(oauthTarget);
    }),
    vscode.window.onDidChangeActiveTextEditor(() => {
      if (vscode.window.activeTerminal) return;
      void detectCurrentAgent(true).catch((error: unknown) => applyError(error, false));
    }),
    new vscode.Disposable(() => {
      if (timer) clearInterval(timer);
      tooltipController.dispose();
    }),
  );

  resetTimer();
  void detectCurrentAgent(false)
    .then(async () => {
      applyCachedStatusForCurrentTarget();
      void update(false);
      const agents = await loadAgents();
      for (const agent of agents) {
        const target = {
          agentId: agent.agentId,
          sessionKey: agent.sessionKey || `agent:${agent.agentId}:main`,
        };
        if (targetCacheKey(target) === targetCacheKey(currentTarget())) continue;
        void client
          .status(target, false)
          .then((status) => {
            cacheStatus(status);
          })
          .catch((error: unknown) => {
            output.appendLine(
              `[${new Date().toISOString()}] background status prefetch failed for ${
                agent.agentId
              }: ${error instanceof Error ? error.message : String(error)}`,
            );
          });
      }
    })
    .catch((error: unknown) => applyError(error, false));
}

export function deactivate(): void {}
