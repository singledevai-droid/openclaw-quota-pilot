import { describe, expect, it } from "vitest";

import {
  cachedStatusForTarget,
  statusCacheKey,
  targetCacheKey,
} from "../src/status-cache.js";
import type { PilotStatus } from "../src/types.js";

const main = {
  agentId: "main",
  sessionKey: "agent:main:main",
} as PilotStatus;
const growth = {
  agentId: "tg-growth",
  sessionKey: "agent:tg-growth:main",
} as PilotStatus;

describe("status cache", () => {
  it("returns the saved snapshot for the newly focused agent immediately", () => {
    const cache = new Map([
      [statusCacheKey(main), main],
      [statusCacheKey(growth), growth],
    ]);
    expect(
      cachedStatusForTarget(cache, {
        agentId: "main",
        sessionKey: "agent:main:main",
      }),
    ).toBe(main);
  });

  it("never reuses another agent's snapshot", () => {
    const cache = new Map([[statusCacheKey(growth), growth]]);
    expect(
      cachedStatusForTarget(cache, {
        agentId: "wb-assistant",
        sessionKey: "agent:wb-assistant:main",
      }),
    ).toBeNull();
  });

  it("keys a route by both agent and session", () => {
    expect(
      targetCacheKey({ agentId: "main", sessionKey: "agent:main:main" }),
    ).not.toBe(
      targetCacheKey({ agentId: "main", sessionKey: "agent:main:other" }),
    );
  });
});
