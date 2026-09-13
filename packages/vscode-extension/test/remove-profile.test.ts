import { describe, expect, it, vi } from "vitest";
import { removeProfileWithConfirmation } from "../src/remove-profile.js";
import type { PilotStatus } from "../src/types.js";

const target = { agentId: "content-agent", sessionKey: "agent:content-agent:main" };
const profileId = "openai:unused@example.com";
function fixture() {
  const snapshot = {
    ...target,
    credentialOwnerAgentId: "main",
    activeProfileId: "openai:active@example.com",
    selectedProfileId: "openai:active@example.com",
    profiles: [{ profileId, label: "Unused", active: false, provider: "openai" }],
  } as PilotStatus;
  const client = {
    status: vi.fn().mockResolvedValue(snapshot),
    removeProfile: vi.fn().mockResolvedValue(undefined),
  };
  return { snapshot, client };
}

describe("profile removal", () => {
  it("requires explicit confirmation and deletes from the shared owner, not the routed agent", async () => {
    const { client } = fixture();
    const confirm = vi.fn().mockResolvedValue(true);
    expect(await removeProfileWithConfirmation(client, target, profileId, confirm)).toBe(true);
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ profileId }), "main");
    expect(client.status).toHaveBeenNthCalledWith(2, target, true);
    expect(client.removeProfile).toHaveBeenCalledExactlyOnceWith("main", profileId);
  });

  it("does not delete on cancel", async () => {
    const { client } = fixture();
    expect(await removeProfileWithConfirmation(client, target, profileId, async () => false)).toBe(false);
    expect(client.removeProfile).not.toHaveBeenCalled();
  });

  it.each(["activeProfileId", "selectedProfileId"])("blocks %s even if the displayed active flag is stale", async (field) => {
    const { snapshot, client } = fixture();
    client.status.mockResolvedValue({ ...snapshot, [field]: profileId });
    const confirm = vi.fn();
    await expect(removeProfileWithConfirmation(client, target, profileId, confirm)).rejects.toThrow("Switch this session");
    expect(confirm).not.toHaveBeenCalled();
    expect(client.removeProfile).not.toHaveBeenCalled();
  });

  it("blocks a profile selected by AUTO while confirmation was open", async () => {
    const { snapshot, client } = fixture();
    client.status.mockResolvedValueOnce(snapshot).mockResolvedValue({ ...snapshot, activeProfileId: profileId });
    await expect(removeProfileWithConfirmation(client, target, profileId, async () => true)).rejects.toThrow("Switch this session");
    expect(client.removeProfile).not.toHaveBeenCalled();
  });

  it("does not redirect a confirmed deletion to a different credential owner", async () => {
    const { snapshot, client } = fixture();
    client.status.mockResolvedValueOnce(snapshot).mockResolvedValue({ ...snapshot, credentialOwnerAgentId: "support-agent" });
    await expect(removeProfileWithConfirmation(client, target, profileId, async () => true)).rejects.toThrow("owner changed");
    expect(client.removeProfile).not.toHaveBeenCalled();
  });

  it("fails closed when a profile disappears, owner is missing, or inventory cannot be read", async () => {
    for (const variant of [{ profiles: [] }, { credentialOwnerAgentId: undefined }]) {
      const { snapshot, client } = fixture();
      client.status.mockResolvedValue({ ...snapshot, ...variant });
      await expect(removeProfileWithConfirmation(client, target, profileId, async () => true)).rejects.toThrow();
      expect(client.removeProfile).not.toHaveBeenCalled();
    }
    const { client } = fixture();
    client.status.mockRejectedValue(new Error("Gateway disconnected"));
    await expect(removeProfileWithConfirmation(client, target, profileId, async () => true)).rejects.toThrow("Gateway disconnected");
    expect(client.removeProfile).not.toHaveBeenCalled();
  });

  it("reports native logout failure instead of claiming success", async () => {
    const { client } = fixture();
    client.removeProfile.mockRejectedValue(new Error("Auth store lock busy"));
    await expect(removeProfileWithConfirmation(client, target, profileId, async () => true)).rejects.toThrow("Auth store lock busy");
  });
});
