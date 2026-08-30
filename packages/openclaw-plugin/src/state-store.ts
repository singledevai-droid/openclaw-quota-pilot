import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { routeKey } from "./config.js";
import type {
  PersistedState,
  PilotConfig,
  PluginLoggerLike,
  RouteState,
  RouteTarget,
} from "./types.js";

const EMPTY_STATE: PersistedState = { version: 1, routes: {} };

function validPollInterval(value: unknown): number | undefined {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 30 &&
    value <= 3600
    ? value
    : undefined;
}

function isRouteState(value: unknown): value is RouteState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const route = value as Partial<RouteState>;
  return (
    typeof route.agentId === "string" &&
    typeof route.sessionKey === "string" &&
    typeof route.autoEnabled === "boolean"
  );
}

function sanitizeState(value: unknown): PersistedState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return EMPTY_STATE;
  const candidate = value as Partial<PersistedState>;
  const routes = Object.fromEntries(
    Object.entries(candidate.routes ?? {}).filter((entry): entry is [string, RouteState] =>
      isRouteState(entry[1]),
    ),
  );
  const pollIntervalSeconds = validPollInterval(candidate.pollIntervalSeconds);
  return pollIntervalSeconds === undefined
    ? { version: 1, routes }
    : { version: 1, pollIntervalSeconds, routes };
}

export class PilotStateStore {
  readonly path: string;
  private state: PersistedState = { version: 1, routes: {} };

  constructor(
    stateDir: string,
    private readonly logger: PluginLoggerLike,
  ) {
    this.path = join(stateDir, "quota-pilot", "state.json");
  }

  async load(): Promise<void> {
    try {
      const raw = await readFile(this.path, "utf8");
      this.state = sanitizeState(JSON.parse(raw));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        this.logger.warn("quota-pilot ignored an invalid state file", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
      this.state = { version: 1, routes: {} };
    }
  }

  getRoute(target: RouteTarget, config: PilotConfig): RouteState {
    const key = routeKey(target);
    const existing = this.state.routes[key];
    if (existing) return { ...existing };
    return {
      ...target,
      autoEnabled: config.autoEnabledByDefault,
      manualProfileId: null,
      lastSwitchAt: null,
      lastSwitchReason: null,
    };
  }

  listRoutes(): RouteState[] {
    return Object.values(this.state.routes).map((route) => ({ ...route }));
  }

  getPollInterval(fallback: number): number {
    return validPollInterval(this.state.pollIntervalSeconds) ?? fallback;
  }

  async setPollInterval(seconds: number): Promise<void> {
    const normalized = validPollInterval(seconds);
    if (normalized === undefined) {
      throw new Error("pollIntervalSeconds must be an integer from 30 to 3600");
    }
    this.state.pollIntervalSeconds = normalized;
    await this.save();
  }

  async setRoute(route: RouteState): Promise<void> {
    this.state.routes[routeKey(route)] = { ...route };
    await this.save();
  }

  private async save(): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    const temporaryPath = `${this.path}.${process.pid}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(this.state, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    await chmod(temporaryPath, 0o600);
    await rename(temporaryPath, this.path);
  }
}
