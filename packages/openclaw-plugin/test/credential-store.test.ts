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
  const token = (email: string, accountId = "account-one") =>
    `header.${Buffer.from(JSON.stringify({
      "https://api.openai.com/profile": { email },
      "https://api.openai.com/auth": { chatgpt_account_id: accountId },
    })).toString("base64url")}.signature`;

  it("rejects another person's credential saved under an email-named profile", () => {
    const inventory = credentialInventoryFromStore({ version: 1, profiles: {
      "openai:first@example.com": { ...oauth("second@example.com"), access: token("second@example.com") },
    } });
    expect(inventory.profiles[0]?.identityError).toBe("profile-identity-mismatch");
  });

  it("checks token identity even when stored email appears correct", () => {
    const inventory = credentialInventoryFromStore({ version: 1, profiles: {
      "openai:first@example.com": { ...oauth("first@example.com"), access: token("second@example.com") },
    } });
    expect(inventory.profiles[0]?.identityError).toBe("profile-identity-mismatch");
  });

  it("does not double-count aliases with independently issued tokens for the same account", () => {
    const inventory = credentialInventoryFromStore({ version: 1, profiles: {
      "openai:alias": { ...oauth("one@example.com"), access: token("one@example.com") },
      "openai:one@example.com": { ...oauth("one@example.com"), access: token("one@example.com") + "other" },
    } });
    expect(inventory.profiles.find(p => p.profileId === "openai:alias")?.identityError).toBe("duplicate-account-profile");
    expect(inventory.profiles.find(p => p.profileId === "openai:one@example.com")?.identityError).toBeNull();
  });

  it("keeps separate people in a shared workspace and separate account contexts", () => {
    const inventory = credentialInventoryFromStore({ version: 1, profiles: {
      "openai:one@example.com": { ...oauth("one@example.com"), access: token("one@example.com") },
      "openai:two@example.com": { ...oauth("two@example.com"), access: token("two@example.com") },
      "openai:work": { ...oauth("one@example.com"), access: token("one@example.com", "account-two") },
    } });
    expect(inventory.profiles.every(p => !p.identityError)).toBe(true);
  });

  it("does not let an expired canonical entry suppress a healthy alias", () => {
    const inventory = credentialInventoryFromStore({ version: 1, profiles: {
      "openai:one@example.com": { ...oauth("one@example.com"), access: token("one@example.com"), expires: 1 },
      "openai:alias": { ...oauth("one@example.com"), access: token("one@example.com") },
    } });
    expect(inventory.profiles.find(p => p.profileId === "openai:alias")?.identityError).toBeNull();
  });

  it("recovers an omitted account header from claims and rejects a conflicting header", () => {
    const inventory = credentialInventoryFromStore({ version: 1, profiles: {
      "openai:one@example.com": { ...oauth("one@example.com"), access: token("one@example.com") },
      "openai:two@example.com": { ...oauth("two@example.com"), access: token("two@example.com"), accountId: "wrong-account" },
    } });
    expect(inventory.profiles[0]?.accountId).toBe("account-one");
    expect(inventory.profiles[1]?.identityError).toBe("profile-identity-mismatch");
  });
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
