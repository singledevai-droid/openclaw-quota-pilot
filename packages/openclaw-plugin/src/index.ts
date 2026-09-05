import {
  definePluginEntry,
  type OpenClawPluginDefinition,
} from "openclaw/plugin-sdk/plugin-entry";

import { normalizeRouteTarget, parsePilotConfig } from "./config.js";
import { QuotaPilotController } from "./controller.js";
import { PilotStateStore } from "./state-store.js";
import { routeTargetFromSessionKey } from "./runtime-routing.js";

function booleanParam(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function stringParam(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${name} must be a non-empty string`);
  }
  return value.trim();
}

function errorShape(error: unknown): { code: string; message: string } {
  return {
    code: "UNAVAILABLE",
    message: error instanceof Error ? error.message : String(error),
  };
}

const plugin: OpenClawPluginDefinition = definePluginEntry({
  id: "quota-pilot",
  name: "Quota Pilot",
  description:
    "Monitors OpenAI Codex quota and routes sessions across OAuth profiles without LLM calls",
  register(api) {
    if (api.registrationMode !== "full") return;

    const config = parsePilotConfig(api.pluginConfig);
    let controller: QuotaPilotController | null = null;

    api.registerService({
      id: "quota-pilot-monitor",
      async start(context) {
        const stateStore = new PilotStateStore(context.stateDir, api.logger);
        controller = new QuotaPilotController(api, config, stateStore, api.logger);
        await controller.start();
        api.logger.info(
          `quota-pilot monitor started agent=${config.agentId} session=${config.sessionKey} interval=${config.pollIntervalSeconds}s autoDefault=${config.autoEnabledByDefault}`,
        );
      },
      stop() {
        controller?.stop();
        controller = null;
      },
    });

    api.on("before_dispatch", async (event, context) => {
      if (!controller) return { handled: false };
      const sessionKey = context.sessionKey ?? event.sessionKey;
      if (!sessionKey) return { handled: false };
      const target = routeTargetFromSessionKey(sessionKey);
      if (!target) return { handled: false };
      try {
        await controller.prepareAutomaticRoute(target);
        return { handled: false };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        api.logger.error(
          `quota-pilot AUTO preflight failed agent=${target.agentId} session=${target.sessionKey} error=${message}`,
        );
        return {
          handled: true,
          text: "Quota Pilot stopped this run because AUTO routing could not be verified. Pin a usable profile manually or retry after refreshing quota.",
        };
      }
    });

    api.registerGatewayMethod(
      "quota-pilot.agents",
      async ({ respond }) => {
        if (!controller) {
          respond(false, undefined, {
            code: "UNAVAILABLE",
            message: "Quota Pilot service is not running",
          });
          return;
        }
        try {
          respond(true, controller.listAgents());
        } catch (error) {
          respond(false, undefined, errorShape(error));
        }
      },
      { scope: "operator.read" },
    );

    api.registerGatewayMethod(
      "quota-pilot.status",
      async ({ params, respond }) => {
        if (!controller) {
          respond(false, undefined, {
            code: "UNAVAILABLE",
            message: "Quota Pilot service is not running",
          });
          return;
        }
        try {
          const target = normalizeRouteTarget(params, config);
          const status = await controller.getStatus(
            target,
            booleanParam(params.refresh, false),
          );
          respond(true, status);
        } catch (error) {
          respond(false, undefined, errorShape(error));
        }
      },
      { scope: "operator.read" },
    );

    api.registerGatewayMethod(
      "quota-pilot.sessions",
      async ({ params, respond }) => {
        if (!controller) {
          respond(false, undefined, {
            code: "UNAVAILABLE",
            message: "Quota Pilot service is not running",
          });
          return;
        }
        try {
          respond(
            true,
            await controller.listSessions(stringParam(params.agentId, "agentId")),
          );
        } catch (error) {
          respond(false, undefined, errorShape(error));
        }
      },
      { scope: "operator.read" },
    );

    api.registerGatewayMethod(
      "quota-pilot.refresh",
      async ({ params, respond }) => {
        if (!controller) {
          respond(false, undefined, {
            code: "UNAVAILABLE",
            message: "Quota Pilot service is not running",
          });
          return;
        }
        try {
          const status = await controller.getStatus(
            normalizeRouteTarget(params, config),
            true,
          );
          respond(true, status);
        } catch (error) {
          respond(false, undefined, errorShape(error));
        }
      },
      { scope: "operator.read" },
    );

    api.registerGatewayMethod(
      "quota-pilot.switch",
      async ({ params, respond }) => {
        if (!controller) {
          respond(false, undefined, {
            code: "UNAVAILABLE",
            message: "Quota Pilot service is not running",
          });
          return;
        }
        try {
          const status = await controller.switchManually(
            normalizeRouteTarget(params, config),
            stringParam(params.profileId, "profileId"),
          );
          respond(true, status);
        } catch (error) {
          respond(false, undefined, errorShape(error));
        }
      },
      { scope: "operator.write" },
    );

    api.registerGatewayMethod(
      "quota-pilot.mode",
      async ({ params, respond }) => {
        if (!controller) {
          respond(false, undefined, {
            code: "UNAVAILABLE",
            message: "Quota Pilot service is not running",
          });
          return;
        }
        try {
          if (typeof params.autoEnabled !== "boolean") {
            throw new Error("autoEnabled must be a boolean");
          }
          const status = await controller.setAutomaticMode(
            normalizeRouteTarget(params, config),
            params.autoEnabled,
          );
          respond(true, status);
        } catch (error) {
          respond(false, undefined, errorShape(error));
        }
      },
      { scope: "operator.write" },
    );

    api.registerGatewayMethod(
      "quota-pilot.interval",
      async ({ params, respond }) => {
        if (!controller) {
          respond(false, undefined, {
            code: "UNAVAILABLE",
            message: "Quota Pilot service is not running",
          });
          return;
        }
        try {
          if (typeof params.pollIntervalSeconds !== "number") {
            throw new Error("pollIntervalSeconds must be a number");
          }
          const status = await controller.setPollInterval(
            normalizeRouteTarget(params, config),
            params.pollIntervalSeconds,
          );
          respond(true, status);
        } catch (error) {
          respond(false, undefined, errorShape(error));
        }
      },
      { scope: "operator.write" },
    );
  },
});

export default plugin;

export { decideAutomaticRouting, rankQuotaProfiles } from "./scoring.js";
export { parseQuotaWindow } from "./wham.js";
export type {
  AgentSummary,
  PilotStatus,
  QuotaProfile,
  QuotaWindow,
  SessionSummary,
} from "./types.js";
