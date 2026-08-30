import { describe, expect, it } from "vitest";

import { parsePilotConfig } from "../src/config.js";

describe("plugin configuration", () => {
  it("defaults to a 30-second quota refresh", () => {
    expect(parsePilotConfig().pollIntervalSeconds).toBe(30);
  });

  it("clamps the refresh interval to supported bounds", () => {
    expect(parsePilotConfig({ pollIntervalSeconds: 1 }).pollIntervalSeconds).toBe(30);
    expect(parsePilotConfig({ pollIntervalSeconds: 9999 }).pollIntervalSeconds).toBe(3600);
  });
});
