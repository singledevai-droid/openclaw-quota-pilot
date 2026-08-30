import { describe, expect, it } from "vitest";

import { listConfiguredAgents } from "../src/agents.js";

describe("listConfiguredAgents", () => {
  it("lists configured agents with human labels and main sessions", () => {
    const config = {
      agents: {
        list: [
          { id: "main", name: "main", identity: { name: "KLAVDIY" } },
          { id: "tg-growth", identity: { name: "КЛАВДИЙ GROWTH" } },
        ],
      },
    };
    expect(listConfiguredAgents(config, "main")).toEqual([
      { agentId: "main", label: "KLAVDIY", sessionKey: "agent:main:main" },
      {
        agentId: "tg-growth",
        label: "КЛАВДИЙ GROWTH",
        sessionKey: "agent:tg-growth:main",
      },
    ]);
  });

  it("adds the fallback agent and ignores duplicate or empty entries", () => {
    const config = {
      agents: { list: [{ id: "wb-assistant" }, { id: "wb-assistant" }, { id: "" }] },
    };
    expect(listConfiguredAgents(config, "main")).toEqual([
      { agentId: "main", label: "main", sessionKey: "agent:main:main" },
      {
        agentId: "wb-assistant",
        label: "wb-assistant",
        sessionKey: "agent:wb-assistant:main",
      },
    ]);
  });
});
