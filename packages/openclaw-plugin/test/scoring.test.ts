import { describe, expect, it } from "vitest";

import {
  bottleneckRemaining,
  decideAutomaticRouting,
  rankQuotaProfiles,
} from "../src/scoring.js";
import type { QuotaProfile, QuotaWindow } from "../src/types.js";

function window(remainingPercent: number): QuotaWindow {
  return {
    usedPercent: 100 - remainingPercent,
    remainingPercent,
    resetAt: Date.now() + 1000,
    resetAfterSeconds: 1,
    windowSeconds: 1000,
  };
}

function profile(
  id: string,
  fiveHour: number,
  weekly: number,
  usable = true,
): QuotaProfile {
  return {
    profileId: id,
    label: id,
    email: `${id}@example.com`,
    provider: "openai",
    authStatus: "ok",
    tokenExpiresAt: Date.now() + 100_000,
    plan: "plus",
    fiveHour: window(fiveHour),
    weekly: window(weekly),
    limitReached: !usable,
    usable,
    score: null,
    error: usable ? null : "exhausted",
    checkedAt: Date.now(),
  };
}

describe("quota ranking", () => {
  it("ranks by the bottleneck window before total remaining quota", () => {
    const ranked = rankQuotaProfiles([
      profile("five-hour-heavy", 100, 20),
      profile("balanced", 55, 55),
    ]);
    expect(ranked[0]?.profileId).toBe("balanced");
    expect(bottleneckRemaining(ranked[0]!)).toBe(55);
  });

  it("keeps unavailable profiles at the end of fallback order", () => {
    const ranked = rankQuotaProfiles([
      profile("blocked", 100, 100, false),
      profile("healthy", 40, 40),
    ]);
    expect(ranked.map((item) => item.profileId)).toEqual(["healthy", "blocked"]);
  });
});

describe("automatic routing", () => {
  const config = { reservePercent: 15, switchHysteresisPercent: 5 };

  it("switches before a low profile is exhausted", () => {
    const decision = decideAutomaticRouting(
      [profile("current", 10, 80), profile("next", 90, 70)],
      "current",
      config,
    );
    expect(decision.shouldSwitch).toBe(true);
    expect(decision.selectedProfileId).toBe("next");
    expect(decision.orderedProfileIds).toEqual(["next", "current"]);
  });

  it("does not churn while the active profile stays above reserve", () => {
    const decision = decideAutomaticRouting(
      [profile("current", 40, 40), profile("next", 100, 100)],
      "current",
      config,
    );
    expect(decision.shouldSwitch).toBe(false);
    expect(decision.selectedProfileId).toBe("current");
    expect(decision.orderedProfileIds).toEqual(["current", "next"]);
  });

  it("immediately replaces an unavailable active profile", () => {
    const decision = decideAutomaticRouting(
      [profile("current", 0, 20, false), profile("next", 25, 25)],
      "current",
      config,
    );
    expect(decision.shouldSwitch).toBe(true);
    expect(decision.selectedProfileId).toBe("next");
  });
});
