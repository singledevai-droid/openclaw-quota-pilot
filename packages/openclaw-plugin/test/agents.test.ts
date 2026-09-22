import { describe, expect, it } from "vitest";

import { listConfiguredAgents } from "../src/agents.js";

describe("listConfiguredAgents", () => {
  it("lists configured agents with human labels and main sessions", () => {
    const config = {
      agents: {
        list: [
          { id: "main", name: "main", identity: { name: "Primary Agent" } },
          { id: "content-agent", identity: { name: "Content Agent" } },
        ],
      },
    };
    expect(listConfiguredAgents(config, "main")).toEqual([
      { agentId: "main", label: "Primary Agent", sessionKey: "agent:main:main" },
      {
        agentId: "content-agent",
        label: "Content Agent",
        sessionKey: "agent:content-agent:main",
      },
    ]);
  });

  it("adds the fallback agent and ignores duplicate or empty entries", () => {
    const config = {
      agents: { list: [{ id: "support-agent" }, { id: "support-agent" }, { id: "" }] },
    };
    expect(listConfiguredAgents(config, "main")).toEqual([
      { agentId: "main", label: "main", sessionKey: "agent:main:main" },
      {
        agentId: "support-agent",
        label: "support-agent",
        sessionKey: "agent:support-agent:main",
      },
    ]);
  });
});

describe("modern agent inventory", () => {
  it("supports entries-only and treats the map key as authoritative", () => {
    expect(listConfiguredAgents({ agents: { entries: { main: { name: "Primary" }, "content-agent": { id: "wrong", identity: { name: "Worker" } } } } } as any, "main")).toEqual([
      { agentId: "main", label: "Primary", sessionKey: "agent:main:main" },
      { agentId: "content-agent", label: "Worker", sessionKey: "agent:content-agent:main" },
    ]);
  });
  it("deduplicates mixed entries/list with entries taking precedence", () => {
    expect(listConfiguredAgents({ agents: { entries: { main: { name: "New" } }, list: [{ id: "main", name: "Old" }, { id: "support-agent" }] } } as any, "main").map(a => [a.agentId, a.label])).toEqual([["main", "New"], ["support-agent", "support-agent"]]);
  });
});
