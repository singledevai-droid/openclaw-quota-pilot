import { beforeEach, describe, expect, it, vi } from "vitest";
import { execFile } from "node:child_process";
import { OpenClawClient } from "../src/openclaw-client.js";
import type { ExtensionSettings } from "../src/types.js";
import type { OutputChannel } from "vscode";

vi.mock("node:child_process", () => ({ execFile: vi.fn() }));
const client = new OpenClawClient(
  () => ({ openclawExecutable: "/custom path/openclaw", gatewayTimeoutMs: 30000 }) as ExtensionSettings,
  { appendLine: vi.fn() } as unknown as OutputChannel,
);

describe("native profile logout", () => {
  beforeEach(() => { vi.mocked(execFile).mockReset(); });

  it("uses an argument array and accepts the native non-JSON success response", async () => {
    vi.mocked(execFile).mockImplementation(((...args: unknown[]) => {
      const callback = args[3] as (err: null, stdout: string, stderr: string) => void;
      callback(null, "Removed auth profile: openai:test@example.com (openai/oauth)\n", "");
    }) as typeof execFile);
    const id = "openai:test;$(echo unsafe)@example.com";
    await expect(client.removeProfile("main", id)).resolves.toBeUndefined();
    expect(execFile).toHaveBeenCalledWith(
      "/custom path/openclaw",
      ["models", "auth", "logout", id, "--agent", "main", "--yes"],
      expect.objectContaining({ timeout: 32000, windowsHide: true }),
      expect.any(Function),
    );
  });

  it("does not swallow an unsupported CLI or store-write failure", async () => {
    vi.mocked(execFile).mockImplementation(((...args: unknown[]) => {
      const callback = args[3] as (err: Error, stdout: string, stderr: string) => void;
      callback(new Error("unknown command logout"), "", "");
    }) as typeof execFile);
    await expect(client.removeProfile("main", "openai:test@example.com")).rejects.toThrow("unknown command logout");
  });

  it("rejects invalid owner/profile before starting a process", async () => {
    await expect(client.removeProfile("", "openai:test@example.com")).rejects.toThrow();
    await expect(client.removeProfile("main", "google:test")).rejects.toThrow();
    expect(execFile).not.toHaveBeenCalled();
  });
});
