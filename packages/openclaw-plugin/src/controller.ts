import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";

import { listConfiguredAgents } from "./agents.js";
import { routeKey } from "./config.js";
import { readOpenAiCredentialInventory } from "./credential-store.js";
import { decideAutomaticRouting, rankQuotaProfiles } from "./scoring.js";
import { PilotStateStore } from "./state-store.js";
import { applyManagedSessionProfile } from "./runtime-routing.js";
import type {
  CredentialInventory,
  AgentSummary,
  PilotConfig,
  PilotStatus,
  PluginLoggerLike,
  QuotaProfile,
  RouteState,
  RouteTarget,
  SessionSummary,
} from "./types.js";
import { parseSessionInventory } from "./sessions.js";
import { fetchAllQuotaProfiles } from "./wham.js";

const execFileAsync = promisify(execFile);

type AgentQuotaCache = {
  profiles: QuotaProfile[];
  configuredOrder: string[];
  lastGoodProfileId: string | null;
  refreshedAt: number;
};

type SwitchSource = "manual" | "auto";

export class QuotaPilotController {
  private readonly cache = new Map<string, AgentQuotaCache>();
  private readonly inFlightRefresh = new Map<string, Promise<AgentQuotaCache>>();
  private readonly lastAppliedOrder = new Map<string, string>();
  private timer: NodeJS.Timeout | null = null;
  private stopped = false;

  constructor(
    private readonly api: OpenClawPluginApi,
    private readonly config: PilotConfig,
    private readonly stateStore: PilotStateStore,
    private readonly logger: PluginLoggerLike,
  ) {}

  async start(): Promise<void> {
    await this.stateStore.load();
    this.config.pollIntervalSeconds = this.stateStore.getPollInterval(
      this.config.pollIntervalSeconds,
    );
    const defaultTarget = {
      agentId: this.config.agentId,
      sessionKey: this.config.sessionKey,
    };
    const defaultRoute = this.stateStore.getRoute(defaultTarget, this.config);
    if (this.config.autoEnabledByDefault && !this.stateStore.listRoutes().some(
      (route) => routeKey(route) === routeKey(defaultTarget),
    )) {
      await this.stateStore.setRoute(defaultRoute);
    }

    await this.tick().catch((error) => {
      this.logger.warn("quota-pilot initial refresh failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    });
    this.scheduleTimer();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async setPollInterval(target: RouteTarget, seconds: number): Promise<PilotStatus> {
    if (!Number.isInteger(seconds) || seconds < 30 || seconds > 3600) {
      throw new Error("pollIntervalSeconds must be an integer from 30 to 3600");
    }
    this.config.pollIntervalSeconds = seconds;
    await this.stateStore.setPollInterval(seconds);
    this.scheduleTimer();
    return this.getStatus(target, true);
  }

  private scheduleTimer(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.stopped) return;
    this.timer = setInterval(() => {
      void this.tick().catch((error) => {
        this.logger.warn("quota-pilot background refresh failed", {
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }, this.config.pollIntervalSeconds * 1000);
    this.timer.unref();
  }

  async getStatus(target: RouteTarget, forceRefresh = false): Promise<PilotStatus> {
    const cache = await this.refreshAgent(target.agentId, forceRefresh);
    let route = this.stateStore.getRoute(target, this.config);
    if (route.autoEnabled) {
      route = await this.ensureAutomaticRouting(route, cache);
    }
    return this.buildStatus(route, cache);
  }

  async prepareAutomaticRoute(target: RouteTarget): Promise<PilotStatus | null> {
    const route = this.stateStore.getRoute(target, this.config);
    if (!route.autoEnabled) return null;
    const cache = await this.refreshAgent(target.agentId, true);
    const applied = await this.ensureAutomaticRouting(route, cache, true);
    return this.buildStatus(applied, cache);
  }

  listAgents(): AgentSummary[] {
    return listConfiguredAgents(this.api.config, this.config.agentId).map((agent) => {
      const inventory = readOpenAiCredentialInventory(
        this.api.runtime.agent.resolveAgentDir(this.api.config, agent.agentId),
        this.logger,
      );
      const route = this.stateStore.getRoute(agent, this.config);
      const entry = this.api.runtime.agent.session.getSessionEntry({
        agentId: agent.agentId,
        sessionKey: agent.sessionKey,
        readConsistency: "latest",
      }) as Record<string, unknown> | undefined;
      const sessionProfile = entry?.authProfileOverride;
      const activeProfileId =
        typeof sessionProfile === "string" && sessionProfile.length > 0
          ? sessionProfile
          : route.manualProfileId ??
            inventory.lastGoodProfileId ??
            inventory.configuredOrder[0] ??
            null;
      return {
        ...agent,
        workspaceDir: this.api.runtime.agent.resolveAgentWorkspaceDir(
          this.api.config,
          agent.agentId,
        ),
        activeProfileId,
        profileCount: inventory.profiles.length,
        mode: route.autoEnabled ? "auto" : "manual",
      };
    });
  }

  async listSessions(agentId: string): Promise<SessionSummary[]> {
    const { stdout } = await execFileAsync(
      this.config.openclawExecutable,
      ["sessions", "--agent", agentId, "--json", "--limit", "all"],
      {
        timeout: 15_000,
        maxBuffer: 2 * 1024 * 1024,
        windowsHide: true,
      },
    );
    const sessions = parseSessionInventory(JSON.parse(stdout), agentId);
    const inventory = readOpenAiCredentialInventory(
      this.api.runtime.agent.resolveAgentDir(this.api.config, agentId),
      this.logger,
    );
    const routes = new Map(
      this.stateStore.listRoutes().map((route) => [routeKey(route), route]),
    );
    return sessions.map((session) => {
      const entry = this.api.runtime.agent.session.getSessionEntry({
        agentId,
        sessionKey: session.sessionKey,
        readConsistency: "latest",
      }) as Record<string, unknown> | undefined;
      const override = entry?.authProfileOverride;
      const source = entry?.authProfileOverrideSource;
      const route = routes.get(routeKey(session));
      return {
        ...session,
        activeProfileId:
          typeof override === "string" && override.length > 0
            ? override
            : inventory.lastGoodProfileId ?? inventory.configuredOrder[0] ?? null,
        profileSource:
          route?.autoEnabled
            ? "auto"
            : source === "user"
              ? "pinned"
              : source === "auto"
                ? "auto"
                : "fallback",
      };
    });
  }

  async setAutomaticMode(target: RouteTarget, enabled: boolean): Promise<PilotStatus> {
    const cache = await this.refreshAgent(target.agentId, false);
    let route = this.stateStore.getRoute(target, this.config);
    route = { ...route, autoEnabled: enabled };
    await this.stateStore.setRoute(route);

    if (enabled) {
      route = await this.ensureAutomaticRouting(route, cache, true);
    } else {
      const active = this.resolveActiveProfileId(target, cache, route);
      if (active) {
        await this.patchSessionProfile(target, active, "manual");
        route = {
          ...route,
          manualProfileId: active,
          lastSwitchAt: Date.now(),
          lastSwitchReason: "automatic-mode-disabled",
        };
        await this.stateStore.setRoute(route);
      }
    }
    return this.buildStatus(route, cache);
  }

  async switchManually(target: RouteTarget, profileId: string): Promise<PilotStatus> {
    const cache = await this.refreshAgent(target.agentId, false);
    const profile = cache.profiles.find((candidate) => candidate.profileId === profileId);
    if (!profile) throw new Error(`Unknown OpenAI profile: ${profileId}`);
    if (!profile.usable) {
      throw new Error(
        `Profile ${profile.label} is unavailable${profile.error ? `: ${profile.error}` : ""}`,
      );
    }

    await this.applyAuthOrder(target.agentId, [
      profileId,
      ...cache.profiles
        .map((candidate) => candidate.profileId)
        .filter((candidateId) => candidateId !== profileId),
    ]);
    await this.patchSessionProfile(target, profileId, "manual");
    const route: RouteState = {
      ...this.stateStore.getRoute(target, this.config),
      autoEnabled: false,
      manualProfileId: profileId,
      lastSwitchAt: Date.now(),
      lastSwitchReason: "manual-selection",
    };
    await this.stateStore.setRoute(route);
    return this.buildStatus(route, cache, profileId);
  }

  private async tick(): Promise<void> {
    if (this.stopped) return;
    const defaultTarget: RouteTarget = {
      agentId: this.config.agentId,
      sessionKey: this.config.sessionKey,
    };
    const persistedRoutes = this.stateStore.listRoutes();
    const missingRoutes = persistedRoutes.filter((route) =>
      !this.api.runtime.agent.session.getSessionEntry({
        agentId: route.agentId,
        sessionKey: route.sessionKey,
        readConsistency: "latest",
      })
    );
    if (missingRoutes.length > 0) {
      const removed = await this.stateStore.removeRoutes(missingRoutes);
      this.logger.info("quota-pilot pruned missing session routes", { removed });
    }
    const routes = this.stateStore.listRoutes();
    if (!routes.some((route) => routeKey(route) === routeKey(defaultTarget))) {
      routes.push(this.stateStore.getRoute(defaultTarget, this.config));
    }
    const agentIds = [...new Set(routes.map((route) => route.agentId))];
    const caches = new Map<string, AgentQuotaCache>();
    await Promise.all(
      agentIds.map(async (agentId) => {
        caches.set(agentId, await this.refreshAgent(agentId, true));
      }),
    );
    for (const route of routes.filter((candidate) => candidate.autoEnabled)) {
      const cache = caches.get(route.agentId);
      if (cache) await this.ensureAutomaticRouting(route, cache);
    }
  }

  private async refreshAgent(agentId: string, force: boolean): Promise<AgentQuotaCache> {
    const cached = this.cache.get(agentId);
    const maxAge = this.config.pollIntervalSeconds * 1000;
    if (!force && cached && Date.now() - cached.refreshedAt < maxAge) return cached;

    const existing = this.inFlightRefresh.get(agentId);
    if (existing) return existing;

    const request = this.performRefresh(agentId).finally(() => {
      this.inFlightRefresh.delete(agentId);
    });
    this.inFlightRefresh.set(agentId, request);
    return request;
  }

  private async performRefresh(agentId: string): Promise<AgentQuotaCache> {
    const agentDir = this.api.runtime.agent.resolveAgentDir(this.api.config, agentId);
    const inventory: CredentialInventory = readOpenAiCredentialInventory(
      agentDir,
      this.logger,
    );
    const profiles = rankQuotaProfiles(
      await fetchAllQuotaProfiles(inventory.profiles, this.config),
    );
    const cache: AgentQuotaCache = {
      profiles,
      configuredOrder: inventory.configuredOrder,
      lastGoodProfileId: inventory.lastGoodProfileId,
      refreshedAt: Date.now(),
    };
    this.cache.set(agentId, cache);
    return cache;
  }

  private async ensureAutomaticRouting(
    route: RouteState,
    cache: AgentQuotaCache,
    forceApply = false,
  ): Promise<RouteState> {
    const activeProfileId = this.resolveActiveProfileId(route, cache, route);
    const decision = decideAutomaticRouting(cache.profiles, activeProfileId, this.config);
    if (decision.orderedProfileIds.length > 0) {
      await this.applyAuthOrder(route.agentId, decision.orderedProfileIds);
    }

    const selectedProfileId = decision.selectedProfileId;
    if (
      selectedProfileId &&
      (forceApply || decision.shouldSwitch || activeProfileId !== selectedProfileId)
    ) {
      await this.patchSessionProfile(route, selectedProfileId, "auto");
      const next = {
        ...route,
        manualProfileId: null,
        lastSwitchAt: Date.now(),
        lastSwitchReason: decision.reason,
      };
      await this.stateStore.setRoute(next);
      this.logger.info("quota-pilot selected an automatic OpenAI profile", {
        agentId: route.agentId,
        sessionKey: route.sessionKey,
        profileId: selectedProfileId,
        reason: decision.reason,
      });
      return next;
    }
    return route;
  }

  private resolveActiveProfileId(
    target: RouteTarget,
    cache: AgentQuotaCache,
    route: RouteState,
  ): string | null {
    const entry = this.api.runtime.agent.session.getSessionEntry({
      agentId: target.agentId,
      sessionKey: target.sessionKey,
      readConsistency: "latest",
    }) as Record<string, unknown> | undefined;
    const sessionProfile = entry?.authProfileOverride;
    if (typeof sessionProfile === "string" && sessionProfile.length > 0) {
      return sessionProfile;
    }
    if (route.manualProfileId) return route.manualProfileId;
    return cache.lastGoodProfileId ?? cache.configuredOrder[0] ?? null;
  }

  private async patchSessionProfile(
    target: RouteTarget,
    profileId: string,
    _source: SwitchSource,
  ): Promise<void> {
    const existing = this.api.runtime.agent.session.getSessionEntry({
      agentId: target.agentId,
      sessionKey: target.sessionKey,
      readConsistency: "latest",
    });
    if (!existing) throw new Error(`OpenClaw session not found: ${target.sessionKey}`);

    const updated = await this.api.runtime.agent.session.patchSessionEntry({
      agentId: target.agentId,
      sessionKey: target.sessionKey,
      readConsistency: "latest",
      preserveActivity: true,
      replaceEntry: true,
      update: (entry) => {
        return applyManagedSessionProfile(entry as Record<string, unknown>, profileId);
      },
    });
    if (!updated) throw new Error(`Failed to update OpenClaw session: ${target.sessionKey}`);
    if (
      updated.authProfileOverride !== profileId ||
      updated.authProfileOverrideSource !== "user"
    ) {
      throw new Error(`OpenClaw did not apply profile ${profileId} to ${target.sessionKey}`);
    }
  }

  private async applyAuthOrder(agentId: string, profileIds: string[]): Promise<void> {
    const signature = profileIds.join("\u0000");
    if (this.lastAppliedOrder.get(agentId) === signature) return;
    const args = [
      "models",
      "auth",
      "order",
      "set",
      "--agent",
      agentId,
      "--provider",
      "openai",
      ...profileIds,
    ];
    await execFileAsync(this.config.openclawExecutable, args, {
      timeout: 15_000,
      maxBuffer: 1024 * 1024,
      windowsHide: true,
    });
    this.lastAppliedOrder.set(agentId, signature);
  }

  private buildStatus(
    route: RouteState,
    cache: AgentQuotaCache,
    activeOverride?: string,
  ): PilotStatus {
    const entry = this.api.runtime.agent.session.getSessionEntry({
      agentId: route.agentId,
      sessionKey: route.sessionKey,
      readConsistency: "latest",
    }) as Record<string, unknown> | undefined;
    const overrideSource = entry?.authProfileOverrideSource;
    const routingMode = route.autoEnabled
      ? "auto"
      : overrideSource === "user" || route.manualProfileId
        ? "pinned"
        : "fallback";
    const activeProfileId =
      activeOverride ?? this.resolveActiveProfileId(route, cache, route);
    const ranked = rankQuotaProfiles(cache.profiles);
    const bestProfileId = ranked.find((profile) => profile.usable)?.profileId ?? null;
    const activeProfile = ranked.find((profile) => profile.profileId === activeProfileId);
    const warning = !activeProfileId
      ? "No active OpenAI profile could be resolved"
      : !activeProfile
        ? "The active profile is not present in this agent credential store"
        : !activeProfile.usable
          ? activeProfile.error ?? "The active profile is unavailable"
          : null;

    return {
      version: "0.3.14",
      mode: route.autoEnabled ? "auto" : "manual",
      routingMode,
      agentId: route.agentId,
      credentialOwnerAgentId: this.config.credentialOwnerAgentId,
      sessionKey: route.sessionKey,
      activeProfileId,
      selectedProfileId: activeProfileId,
      bestProfileId,
      reservePercent: this.config.reservePercent,
      switchHysteresisPercent: this.config.switchHysteresisPercent,
      pollIntervalSeconds: this.config.pollIntervalSeconds,
      profiles: ranked.map((profile) => ({
        ...profile,
        active: profile.profileId === activeProfileId,
        best: profile.profileId === bestProfileId,
      })),
      lastRefreshAt: cache.refreshedAt,
      lastSwitchAt: route.lastSwitchAt,
      lastSwitchReason: route.lastSwitchReason,
      warning,
    };
  }
}
