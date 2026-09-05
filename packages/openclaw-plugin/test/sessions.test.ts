import { describe, expect, it } from "vitest";

import { parseSessionInventory, sessionKindFromKey } from "../src/sessions.js";

describe("session inventory", () => {
  it("keeps the requested agent, normalizes cron, and sorts newest first", () => {
    expect(parseSessionInventory({ sessions: [
      { key: "agent:content-agent:main", agentId: "content-agent", kind: "direct", updatedAt: 10 },
      { key: "agent:content-agent:cron:job", agentId: "content-agent", kind: "cron", label: "Posts", updatedAt: 20 },
      { key: "agent:main:main", agentId: "main", updatedAt: 30 },
      { key: "agent:content-agent:explicit:run", agentId: "content-agent", kind: "direct", updatedAt: 40 },
    ] }, "content-agent")).toEqual([
      {
        agentId: "content-agent",
        sessionKey: "agent:content-agent:cron:job",
        kind: "automation",
        label: "Posts",
        updatedAt: 20,
      },
      {
        agentId: "content-agent",
        sessionKey: "agent:content-agent:main",
        kind: "main",
        label: null,
        updatedAt: 10,
      },
    ]);
  });

  it("recognizes Telegram session keys when the CLI omits kind", () => {
    expect(sessionKindFromKey("agent:content-agent:telegram:direct:123")).toBe("telegram");
  });
});
