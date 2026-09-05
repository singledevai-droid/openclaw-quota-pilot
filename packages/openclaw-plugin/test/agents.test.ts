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
