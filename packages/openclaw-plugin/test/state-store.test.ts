import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { PilotStateStore } from "../src/state-store.js";

const directories: string[] = [];
const logger = { info() {}, warn() {}, error() {} };

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

describe("pilot state store", () => {
  it("persists a runtime poll interval without credentials", async () => {
    const directory = await mkdtemp(join(tmpdir(), "quota-pilot-state-"));
    directories.push(directory);
    const store = new PilotStateStore(directory, logger);
    await store.load();
    await store.setPollInterval(45);

    const reloaded = new PilotStateStore(directory, logger);
    await reloaded.load();
    expect(reloaded.getPollInterval(30)).toBe(45);
    expect(await readFile(reloaded.path, "utf8")).not.toContain("token");
  });

  it("removes routes whose OpenClaw sessions no longer exist", async () => {
    const directory = await mkdtemp(join(tmpdir(), "quota-pilot-state-"));
    directories.push(directory);
    const store = new PilotStateStore(directory, logger);
    await store.load();
    await store.setRoute({
      agentId: "main",
      sessionKey: "agent:main:main",
      autoEnabled: true,
      manualProfileId: null,
      lastSwitchAt: null,
      lastSwitchReason: null,
    });
    await store.setRoute({
      agentId: "main",
      sessionKey: "agent:main:cron:stale",
      autoEnabled: true,
      manualProfileId: null,
      lastSwitchAt: null,
      lastSwitchReason: null,
    });

    expect(await store.removeRoutes([{
      agentId: "main",
      sessionKey: "agent:main:cron:stale",
    }])).toBe(1);
    expect(store.listRoutes().map((route) => route.sessionKey)).toEqual([
      "agent:main:main",
    ]);
  });
});
