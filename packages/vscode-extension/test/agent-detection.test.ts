import { describe, expect, it } from "vitest";

import {
  detectAgentForWindow,
  detectAgentFromPath,
  detectAgentFromTerminalName,
  resolveAgentId,
} from "../src/agent-detection.js";
import type { AgentSummary } from "../src/types.js";

const agents = [
  { agentId: "main", label: "Primary Agent", workspaceDir: "/srv/openclaw/workspace" },
  { agentId: "support-agent", label: "Support Agent", workspaceDir: "/srv/openclaw/workspace-support-agent" },
  { agentId: "content-agent", label: "Content Agent", workspaceDir: "/srv/openclaw/workspace-content-agent" },
] as AgentSummary[];

describe("detectAgentFromTerminalName", () => {
  it.each([
    ["content", "content-agent"],
    ["Main", "main"],
    ["support", "support-agent"],
    ["Content Agent", "content-agent"],
  ])("maps terminal %s to %s", (terminalName, expectedAgentId) => {
    expect(detectAgentFromTerminalName(agents, terminalName)?.agentId).toBe(
      expectedAgentId,
    );
  });

  it("does not guess from an unrelated terminal name", () => {
    expect(detectAgentFromTerminalName(agents, "bash")).toBeNull();
  });
});

describe("detectAgentFromPath", () => {
  it("matches nested terminal paths to the owning agent workspace", () => {
    expect(
      detectAgentFromPath(agents, "/srv/openclaw/workspace-content-agent/content")
        ?.agentId,
    ).toBe("content-agent");
  });

  it("does not confuse workspaces that share a string prefix", () => {
    expect(detectAgentFromPath(agents, "/srv/openclaw/workspace-old")).toBeNull();
  });

  it("returns null when the terminal cwd is unavailable", () => {
    expect(detectAgentFromPath(agents, undefined)).toBeNull();
  });
});

describe("resolveAgentId", () => {
  it("keeps a manual override local even while automatic detection has a match", () => {
    expect(resolveAgentId("main", true, "content-agent", "support-agent")).toBe(
      "support-agent",
    );
  });

  it("uses the detected agent after the per-window override is cleared", () => {
    expect(resolveAgentId("main", true, "content-agent", null)).toBe("content-agent");
  });

  it("uses the configured fallback when detection is disabled", () => {
    expect(resolveAgentId("main", false, "content-agent", null)).toBe("main");
  });
});

describe("detectAgentForWindow", () => {
  it("falls back to the window workspace when an active terminal has no matching cwd", () => {
    expect(
      detectAgentForWindow(
        agents,
        "/tmp/unrelated-terminal",
        ["/srv/openclaw/workspace-content-agent"],
        undefined,
      )?.agentId,
    ).toBe("content-agent");
  });

  it("prefers an active terminal match over the window workspace", () => {
    expect(
      detectAgentForWindow(
        agents,
        "/srv/openclaw/workspace-support-agent/task",
        ["/srv/openclaw/workspace-content-agent"],
        undefined,
      )?.agentId,
    ).toBe("support-agent");
  });

  it("uses the active editor after terminal and workspace fallbacks", () => {
    expect(
      detectAgentForWindow(
        agents,
        undefined,
        [],
        "/srv/openclaw/workspace-content-agent/content/post.md",
      )?.agentId,
    ).toBe("content-agent");
  });
});
