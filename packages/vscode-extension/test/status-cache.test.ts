import { describe, expect, it } from "vitest";

import {
  cachedStatusForTarget,
  restoreStatusCache,
  STATUS_CACHE_SCHEMA_VERSION,
  statusCacheKey,
  targetCacheKey,
} from "../src/status-cache.js";
import type { PilotStatus } from "../src/types.js";

const main = {
  agentId: "main",
  sessionKey: "agent:main:main",
} as PilotStatus;
const content = {
  agentId: "content-agent",
  sessionKey: "agent:content-agent:main",
} as PilotStatus;

describe("status cache", () => {
  it("returns the saved snapshot for the newly focused agent immediately", () => {
    const cache = new Map([
      [statusCacheKey(main), main],
      [statusCacheKey(content), content],
    ]);
    expect(
      cachedStatusForTarget(cache, {
        agentId: "main",
        sessionKey: "agent:main:main",
      }),
    ).toBe(main);
  });

  it("never reuses another agent's snapshot", () => {
    const cache = new Map([[statusCacheKey(content), content]]);
    expect(
      cachedStatusForTarget(cache, {
        agentId: "support-agent",
        sessionKey: "agent:support-agent:main",
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

  it("restores snapshots written by the current cache schema", () => {
    const cache = restoreStatusCache(
      { [statusCacheKey(main)]: main },
      STATUS_CACHE_SCHEMA_VERSION,
    );
    expect(cache.get(statusCacheKey(main))).toBe(main);
  });

  it("discards snapshots from an older or unversioned extension cache", () => {
    const saved = { [statusCacheKey(main)]: main };
    expect(restoreStatusCache(saved, STATUS_CACHE_SCHEMA_VERSION - 1).size).toBe(0);
    expect(restoreStatusCache(saved, undefined).size).toBe(0);
  });
});
