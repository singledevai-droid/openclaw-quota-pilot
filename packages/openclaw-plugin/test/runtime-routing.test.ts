import { describe, expect, it } from "vitest";

import {
  applyManagedSessionProfile,
  routeTargetFromSessionKey,
} from "../src/runtime-routing.js";

describe("runtime-safe routing", () => {
  it("derives the owning agent from a canonical session key", () => {
    expect(routeTargetFromSessionKey("agent:content-agent:telegram:direct:42")).toEqual({
      agentId: "content-agent",
      sessionKey: "agent:content-agent:telegram:direct:42",
    });
    expect(routeTargetFromSessionKey("not-a-session")).toBeNull();
  });

  it("persists plugin AUTO decisions as hard runtime selections", () => {
    expect(applyManagedSessionProfile({
      sessionId: "session-1",
      compactionCount: 3,
      authProfileOverride: "openai:old",
      authProfileOverrideSource: "auto",
      authProfileOverrideCompactionCount: 3,
    }, "openai:healthy")).toEqual({
      sessionId: "session-1",
      compactionCount: 3,
      authProfileOverride: "openai:healthy",
      authProfileOverrideSource: "user",
    });
  });
});

import { runtimeAuthEvidence } from "../src/runtime-routing.js";
it("never presents selection or lastGood as runtime evidence", () => {
  expect(runtimeAuthEvidence({ authProfileOverride: "openai:a" }, "openai:a")).toEqual({ effectiveProfileId: null, runtimeAuthStatus: "unverified" });
});
it("reports a differing recorded binding as pending", () => {
  expect(runtimeAuthEvidence({ cliSessionBindings: { codex: { sessionId: "s", authProfileId: "openai:a" } } }, "openai:b")).toEqual({ effectiveProfileId: "openai:a", runtimeAuthStatus: "pending" });
});
it("does not guess among conflicting or unrelated bindings", () => {
  expect(runtimeAuthEvidence({ cliSessionBindings: { codex: { sessionId: "s", authProfileId: "openai:a" }, openai: { sessionId: "t", authProfileId: "openai:b" } } }, "openai:b").effectiveProfileId).toBeNull();
});
