import { describe, expect, it, vi } from "vitest";
vi.mock("../src/credential-store.js", () => ({ readOpenAiCredentialInventory: vi.fn() }));
vi.mock("../src/wham.js", () => ({ fetchAllQuotaProfiles: vi.fn() }));
import { QuotaPilotController } from "../src/controller.js";
import { parsePilotConfig } from "../src/config.js";
import { readOpenAiCredentialInventory } from "../src/credential-store.js";
import { fetchAllQuotaProfiles } from "../src/wham.js";

function fixture(agentId = "worker", suffix = "main", usable = true) {
  const target = { agentId, sessionKey: `agent:${agentId}:${suffix}` };
  let entry: any = { sessionId: "s1", updatedAt: 10, authProfileOverride: "openai:old" };
  let route: any = { ...target, autoEnabled: true, manualProfileId: null, lastSwitchAt: null, lastSwitchReason: null };
  const patchSessionEntry = vi.fn(async (params: any) => entry = params.update(entry));
  const api: any = { config: {}, runtime: { agent: { resolveAgentDir: () => "/fixture", session: {
    getSessionEntry: () => entry, patchSessionEntry,
    listSessionEntries: vi.fn(() => [{ sessionKey: target.sessionKey, entry }]),
  } } } };
  const state: any = { getRoute: () => route, setRoute: vi.fn(async (r: any) => { route = r; }), listRoutes: () => [route] };
  vi.mocked(readOpenAiCredentialInventory).mockReturnValue({ profiles: [], configuredOrder: [], lastGoodProfileId: null });
  vi.mocked(fetchAllQuotaProfiles).mockResolvedValue([{ profileId: "openai:healthy", usable, fiveHour: { remainingPercent: 90 }, weekly: { remainingPercent: 80 }, error: usable ? null : "oauth-token-expired" }] as any);
  const controller = new QuotaPilotController(api, parsePilotConfig(), state, { info: vi.fn(), warn: vi.fn(), error: vi.fn() });
  return { target, controller, api, state, patchSessionEntry, setEntry: (e: any) => { entry = e; } };
}

describe("controller AUTO host routing", () => {
  it.each([["main", "main"], ["worker", "main"], ["worker", "cron:job:run:1"]])("routes %s %s without any CLI", async (agent, suffix) => {
    const f = fixture(agent, suffix);
    const status = await f.controller.prepareAutomaticRoute(f.target);
    expect(status?.selectedProfileId).toBe("openai:healthy");
    expect(status?.runtimeAuthStatus).toBe("unverified");
    expect(f.patchSessionEntry).toHaveBeenCalledWith(expect.objectContaining({ ...f.target, preserveActivity: true, replaceEntry: false }));
    await f.controller.prepareAutomaticRoute(f.target);
    expect(f.patchSessionEntry).toHaveBeenCalledTimes(1);
  });
  it("fails closed when no usable profile exists", async () => {
    const f = fixture("worker", "main", false);
    await expect(f.controller.prepareAutomaticRoute(f.target)).rejects.toThrow("No usable");
    expect(f.patchSessionEntry).not.toHaveBeenCalled();
  });
  it("rejects failed host patch verification", async () => {
    const f = fixture(); f.patchSessionEntry.mockImplementation(async () => ({}));
    await expect(f.controller.prepareAutomaticRoute(f.target)).rejects.toThrow("did not apply");
  });
  it("does not alter PINNED routes during AUTO preflight", async () => {
    const f = fixture(); f.state.getRoute = () => ({ ...f.target, autoEnabled: false });
    expect(await f.controller.prepareAutomaticRoute(f.target)).toBeNull();
    expect(f.patchSessionEntry).not.toHaveBeenCalled();
  });
  it("lists sessions through the host rather than spawning a CLI", async () => {
    const f = fixture();
    expect(await f.controller.listSessions("worker")).toEqual([expect.objectContaining(f.target)]);
    expect(f.api.runtime.agent.session.listSessionEntries).toHaveBeenCalledWith({ agentId: "worker", readConsistency: "latest" });
  });
  it("manual switch only affects its session", async () => {
    const f = fixture(); const status = await f.controller.switchManually(f.target, "openai:healthy");
    expect(status.routingMode).toBe("pinned"); expect(status.mode).toBe("manual");
  });
});
