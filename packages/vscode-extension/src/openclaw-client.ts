import { execFile } from "node:child_process";

import type { OutputChannel } from "vscode";

import type {
  AgentSummary,
  ExtensionSettings,
  PilotStatus,
  RouteTarget,
  SessionSummary,
} from "./types.js";

type GatewayEnvelope = {
  ok?: unknown;
  result?: unknown;
  payload?: unknown;
  error?: unknown;
};

function stripAnsi(value: string): string {
  return value.replace(/\u001b\[[0-9;]*m/g, "");
}

export function parseGatewayOutput(output: string): unknown {
  const clean = stripAnsi(output).trim();
  if (!clean) throw new Error("OpenClaw returned an empty response");
  let parsed: unknown;
  try {
    parsed = JSON.parse(clean);
  } catch {
    const start = clean.indexOf("{");
    const end = clean.lastIndexOf("}");
    if (start < 0 || end <= start) {
      throw new Error("OpenClaw did not return JSON");
    }
    parsed = JSON.parse(clean.slice(start, end + 1));
  }

  if (parsed && typeof parsed === "object") {
    const envelope = parsed as GatewayEnvelope;
    if (envelope.ok === false) {
      const error = envelope.error;
      const message =
        error && typeof error === "object" && "message" in error
          ? String((error as { message: unknown }).message)
          : "OpenClaw Gateway rejected the request";
      throw new Error(message);
    }
    if (envelope.result !== undefined) return envelope.result;
    if (envelope.payload !== undefined) return envelope.payload;
  }
  return parsed;
}

export class OpenClawClient {
  constructor(
    private readonly settings: () => ExtensionSettings,
    private readonly output: OutputChannel,
  ) {}

  async agents(): Promise<AgentSummary[]> {
    const agents = await this.call<AgentSummary[]>("quota-pilot.agents", {});
    if (agents.every((agent) => agent.workspaceDir?.trim())) return agents;
    const settings = this.settings();
    const inventory = await this.execute<
      Array<{ id?: unknown; workspace?: unknown }>
    >(
      ["agents", "list", "--json"],
      settings.gatewayTimeoutMs + 2000,
      "agents list",
    );
    const workspaces = new Map(
      inventory
        .filter(
          (entry): entry is { id: string; workspace: string } =>
            typeof entry.id === "string" && typeof entry.workspace === "string",
        )
        .map((entry) => [entry.id, entry.workspace]),
    );
    return agents.map((agent) => {
      const workspaceDir = agent.workspaceDir ?? workspaces.get(agent.agentId);
      return workspaceDir ? { ...agent, workspaceDir } : { ...agent };
    });
  }

  status(target: RouteTarget, refresh = false): Promise<PilotStatus> {
    return this.call<PilotStatus>(
      refresh ? "quota-pilot.refresh" : "quota-pilot.status",
      target,
    );
  }

  sessions(agentId: string): Promise<SessionSummary[]> {
    return this.call<SessionSummary[]>("quota-pilot.sessions", { agentId });
  }

  switchProfile(target: RouteTarget, profileId: string): Promise<PilotStatus> {
    return this.call<PilotStatus>(
      "quota-pilot.switch",
      { ...target, profileId },
      30_000,
    );
  }

  setAutomaticMode(target: RouteTarget, autoEnabled: boolean): Promise<PilotStatus> {
    return this.call<PilotStatus>(
      "quota-pilot.mode",
      { ...target, autoEnabled },
      30_000,
    );
  }

  setPollInterval(
    target: RouteTarget,
    pollIntervalSeconds: number,
  ): Promise<PilotStatus> {
    return this.call<PilotStatus>(
      "quota-pilot.interval",
      { ...target, pollIntervalSeconds },
      30_000,
    );
  }

  private call<T>(
    method: string,
    params: Record<string, unknown>,
    minimumTimeoutMs = 0,
  ): Promise<T> {
    const settings = this.settings();
    const timeoutMs = Math.max(settings.gatewayTimeoutMs, minimumTimeoutMs);
    const args = [
      "gateway",
      "call",
      method,
      "--json",
      "--timeout",
      String(timeoutMs),
      "--params",
      JSON.stringify(params),
    ];
    return this.execute<T>(args, timeoutMs + 2000, `gateway call ${method}`);
  }

  private execute<T>(args: string[], timeoutMs: number, label: string): Promise<T> {
    const settings = this.settings();
    this.output.appendLine(
      `[${new Date().toISOString()}] ${settings.openclawExecutable} ${label}`,
    );
    return new Promise<T>((resolve, reject) => {
      execFile(
        settings.openclawExecutable,
        args,
        {
          timeout: timeoutMs,
          maxBuffer: 2 * 1024 * 1024,
          windowsHide: true,
        },
        (error, stdout, stderr) => {
          if (stderr.trim()) this.output.appendLine(stderr.trim());
          if (error) {
            reject(
              new Error(
                error.killed
                  ? `OpenClaw command timed out: ${label}`
                  : `OpenClaw command failed (${label}): ${error.message}`,
              ),
            );
            return;
          }
          try {
            resolve(parseGatewayOutput(stdout) as T);
          } catch (parseError) {
            this.output.appendLine(`Unparsed response: ${stdout.slice(0, 2000)}`);
            reject(parseError);
          }
        },
      );
    });
  }
}
