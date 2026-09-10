import { describe, expect, it, vi } from "vitest";

import { fetchQuotaProfile, parseQuotaWindow } from "../src/wham.js";
import { parsePilotConfig } from "../src/config.js";

describe("WHAM quota parsing", () => {
  it.each(["profile-identity-mismatch", "duplicate-account-profile"])("does not fetch or route foreign/duplicate quota: %s", async (identityError) => {
    const fetchFn = vi.fn();
    const profile = await fetchQuotaProfile({
      profileId: "openai:one@example.com", provider: "openai", email: "one@example.com",
      accessToken: "test-access", accountId: "account-one", expiresAt: null,
      planHint: "plus", identityError,
    }, parsePilotConfig({}), Date.now(), fetchFn);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(profile).toMatchObject({ usable: false, fiveHour: null, weekly: null, error: identityError });
    expect(JSON.stringify(profile)).not.toContain("test-access");
  });
  it("converts used percentage into remaining quota", () => {
    const now = 1_700_000_000_000;
    const result = parseQuotaWindow(
      {
        used_percent: 63,
        limit_window_seconds: 604800,
        reset_after_seconds: 120,
        reset_at: 1_700_000_120,
      },
      now,
    );
    expect(result).toEqual({
      usedPercent: 63,
      remainingPercent: 37,
      resetAt: 1_700_000_120_000,
      resetAfterSeconds: 120,
      windowSeconds: 604800,
    });
  });

  it("clamps provider percentages to a safe range", () => {
    expect(parseQuotaWindow({ used_percent: 101 }, Date.now())?.remainingPercent).toBe(0);
    expect(parseQuotaWindow({ used_percent: -5 }, Date.now())?.remainingPercent).toBe(100);
  });
});
