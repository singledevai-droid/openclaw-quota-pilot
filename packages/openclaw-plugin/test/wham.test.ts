import { describe, expect, it } from "vitest";

import { parseQuotaWindow } from "../src/wham.js";

describe("WHAM quota parsing", () => {
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
