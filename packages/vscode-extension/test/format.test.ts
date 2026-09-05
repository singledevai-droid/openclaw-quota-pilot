import { describe, expect, it } from "vitest";

import {
  applyProfileLabels,
  buildTooltipMarkdown,
  formatDuration,
  formatStatusBar,
  formatWindow,
} from "../src/format.js";
import type { PilotStatus } from "../src/types.js";

describe("status formatting", () => {
  it("formats reset countdowns for exhausted windows", () => {
    const now = 1_700_000_000_000;
    expect(
      formatWindow(
        "5h",
        {
          usedPercent: 100,
          remainingPercent: 0,
          resetAt: now + 2 * 60 * 60 * 1000 + 10 * 60 * 1000,
          resetAfterSeconds: 7800,
          windowSeconds: 18000,
        },
        now,
      ),
    ).toBe("5h ↻2h 10m");
  });

  it("formats long durations without seconds", () => {
    expect(formatDuration(3 * 86_400_000 + 5 * 3_600_000)).toBe("3d 5h");
  });

  it("shows both quota windows and routing mode", () => {
    const status = {
      agentId: "main",
      mode: "auto",
      routingMode: "auto",
      reservePercent: 15,
      profiles: [
        {
          label: "primary@example.com",
          active: true,
          usable: true,
          fiveHour: { remainingPercent: 82 },
          weekly: { remainingPercent: 37 },
        },
      ],
    } as unknown as PilotStatus;
    expect(formatStatusBar(status, true)).toContain(
      "main · primary@example.com · 5h 82% · W 37% · PROFILE AUTO",
    );
  });

  it("renders each quota field vertically instead of compressing table columns", () => {
    const status = {
      agentId: "main",
      sessionKey: "agent:main:main",
      mode: "manual",
      routingMode: "pinned",
      reservePercent: 15,
      pollIntervalSeconds: 30,
      profiles: [
        {
          label: "very-long-secondary-profile@example.com",
          active: true,
          best: false,
          usable: true,
          fiveHour: { remainingPercent: 32 },
          weekly: { remainingPercent: 74 },
        },
      ],
      lastRefreshAt: null,
      warning: null,
    } as unknown as PilotStatus;
    const markdown = buildTooltipMarkdown(status);
    expect(markdown).not.toContain("| Profile |");
    expect(markdown).toContain("- 5-hour: 32%");
    expect(markdown).toContain("- Weekly: 74%");
    expect(markdown).toContain("- State: ACTIVE");
    expect(markdown).toContain("Profile routing: **PINNED**");
    expect(markdown).toContain(
      "🟢 **very-long-secondary-profile@example.com** · **ACTIVE**",
    );
  });

  it("does not add a green marker to an inactive profile", () => {
    const status = {
      agentId: "main",
      sessionKey: "agent:main:main",
      mode: "manual",
      routingMode: "fallback",
      reservePercent: 15,
      pollIntervalSeconds: 30,
      profiles: [
        {
          label: "inactive@example.com",
          active: false,
          best: false,
          usable: true,
          fiveHour: { remainingPercent: 90 },
          weekly: { remainingPercent: 80 },
        },
      ],
      lastRefreshAt: null,
      warning: null,
    } as unknown as PilotStatus;

    const markdown = buildTooltipMarkdown(status);
    expect(markdown).toContain("**inactive@example.com**");
    expect(markdown).not.toContain("🟢 **inactive@example.com**");
  });

  it("applies a local profile label without changing the profile ID", () => {
    const status = {
      profiles: [{ profileId: "openai:one@example.com", label: "one@example.com" }],
    } as unknown as PilotStatus;
    const labeled = applyProfileLabels(status, {
      "openai:one@example.com": "Main work account",
    });
    expect(labeled.profiles[0]?.label).toBe("Main work account");
    expect(labeled.profiles[0]?.profileId).toBe("openai:one@example.com");
  });
});
