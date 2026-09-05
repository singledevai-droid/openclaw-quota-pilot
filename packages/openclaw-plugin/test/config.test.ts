import { describe, expect, it } from "vitest";

import { parsePilotConfig } from "../src/config.js";

describe("plugin configuration", () => {
  it("defaults to a 30-second quota refresh", () => {
    expect(parsePilotConfig().pollIntervalSeconds).toBe(30);
  });

  it("uses the default agent as the shared credential owner", () => {
    expect(parsePilotConfig({ agentId: "custom" }).credentialOwnerAgentId).toBe(
      "custom",
    );
    expect(
      parsePilotConfig({
        agentId: "custom",
        credentialOwnerAgentId: "main",
      }).credentialOwnerAgentId,
    ).toBe("main");
  });

  it("clamps the refresh interval to supported bounds", () => {
    expect(parsePilotConfig({ pollIntervalSeconds: 1 }).pollIntervalSeconds).toBe(30);
    expect(parsePilotConfig({ pollIntervalSeconds: 9999 }).pollIntervalSeconds).toBe(3600);
  });
});
