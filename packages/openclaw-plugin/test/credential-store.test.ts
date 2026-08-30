import { describe, expect, it } from "vitest";

import type { AuthProfileStore } from "openclaw/plugin-sdk/agent-runtime";

import { credentialInventoryFromStore } from "../src/credential-store.js";

function oauth(email: string) {
  return {
    provider: "openai",
    type: "oauth" as const,
    access: `access-${email}`,
    refresh: `refresh-${email}`,
    expires: Date.now() + 100_000,
    email,
  };
}

describe("runtime credential inventory", () => {
  it("accepts the effective store after OpenClaw merges inherited profiles", () => {
    const store: AuthProfileStore = {
      version: 1,
      profiles: {
        "openai:shared@example.com": oauth("shared@example.com"),
        "openai:local@example.com": oauth("local@example.com"),
      },
      order: {
        openai: ["openai:local@example.com", "openai:shared@example.com"],
      },
      lastGood: { openai: "openai:local@example.com" },
    };

    const inventory = credentialInventoryFromStore(store);
    expect(inventory.profiles.map((profile) => profile.profileId).sort()).toEqual([
      "openai:local@example.com",
      "openai:shared@example.com",
    ]);
    expect(inventory.configuredOrder).toEqual([
      "openai:local@example.com",
      "openai:shared@example.com",
    ]);
    expect(inventory.lastGoodProfileId).toBe("openai:local@example.com");
  });

  it("never copies refresh tokens into the sanitized inventory", () => {
    const inventory = credentialInventoryFromStore({
      version: 1,
      profiles: { "openai:one@example.com": oauth("one@example.com") },
    });
    expect(JSON.stringify(inventory)).not.toContain("refresh-");
  });
});
