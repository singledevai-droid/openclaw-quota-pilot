import { afterEach, describe, expect, it, vi } from "vitest";

import { StatusBarTooltipController } from "../src/status-bar-tooltip.js";

afterEach(() => {
  vi.useRealTimers();
});

describe("status bar tooltip", () => {
  it("stays hidden while a menu interaction returns focus to the status bar", () => {
    vi.useFakeTimers();
    const host: { tooltip: string | undefined } = { tooltip: "Quota details" };
    const controller = new StatusBarTooltipController(host, 300);

    controller.suppressDuringInteraction();
    expect(host.tooltip).toBeUndefined();

    controller.update("Fresh quota details");
    expect(host.tooltip).toBeUndefined();

    controller.restoreAfterInteraction();
    vi.advanceTimersByTime(299);
    expect(host.tooltip).toBeUndefined();
    vi.advanceTimersByTime(1);
    expect(host.tooltip).toBe("Fresh quota details");
  });

  it("cancels an earlier restore when another interaction starts", () => {
    vi.useFakeTimers();
    const host: { tooltip: string | undefined } = { tooltip: "Quota details" };
    const controller = new StatusBarTooltipController(host, 300);

    controller.suppressDuringInteraction();
    controller.restoreAfterInteraction();
    vi.advanceTimersByTime(200);
    controller.suppressDuringInteraction();
    vi.advanceTimersByTime(100);

    expect(host.tooltip).toBeUndefined();
  });
});
