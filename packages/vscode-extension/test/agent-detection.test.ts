import { describe, expect, it } from "vitest";

import {
  detectAgentForWindow,
  detectAgentFromPath,
  detectAgentFromTerminalName,
  resolveAgentId,
} from "../src/agent-detection.js";
import type { AgentSummary } from "../src/types.js";

const agents = [
  { agentId: "main", label: "KLAVDIY", workspaceDir: "/srv/openclaw/workspace" },
  { agentId: "wb-assistant", label: "WB Assistant", workspaceDir: "/srv/openclaw/workspace-wb-assistant" },
  { agentId: "tg-growth", label: "KLAVDIY Growth", workspaceDir: "/srv/openclaw/workspace-tg-growth" },
] as AgentSummary[];

describe("detectAgentFromTerminalName", () => {
  it.each([
    ["TG", "tg-growth"],
    ["Main", "main"],
    ["WB", "wb-assistant"],
    ["KLAVDIY Growth", "tg-growth"],
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
      detectAgentFromPath(agents, "/srv/openclaw/workspace-tg-growth/content")
        ?.agentId,
    ).toBe("tg-growth");
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
    expect(resolveAgentId("main", true, "tg-growth", "wb-assistant")).toBe(
      "wb-assistant",
    );
  });

  it("uses the detected agent after the per-window override is cleared", () => {
    expect(resolveAgentId("main", true, "tg-growth", null)).toBe("tg-growth");
  });

  it("uses the configured fallback when detection is disabled", () => {
    expect(resolveAgentId("main", false, "tg-growth", null)).toBe("main");
  });
});

describe("detectAgentForWindow", () => {
  it("falls back to the window workspace when an active terminal has no matching cwd", () => {
    expect(
      detectAgentForWindow(
        agents,
        "/tmp/unrelated-terminal",
        ["/srv/openclaw/workspace-tg-growth"],
        undefined,
      )?.agentId,
    ).toBe("tg-growth");
  });

  it("prefers an active terminal match over the window workspace", () => {
    expect(
      detectAgentForWindow(
        agents,
        "/srv/openclaw/workspace-wb-assistant/task",
        ["/srv/openclaw/workspace-tg-growth"],
        undefined,
      )?.agentId,
    ).toBe("wb-assistant");
  });

  it("uses the active editor after terminal and workspace fallbacks", () => {
    expect(
      detectAgentForWindow(
        agents,
        undefined,
        [],
        "/srv/openclaw/workspace-tg-growth/content/post.md",
      )?.agentId,
    ).toBe("tg-growth");
  });
});
