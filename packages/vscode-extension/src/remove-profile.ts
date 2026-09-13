import type { PilotStatus, QuotaProfile, RouteTarget } from "./types.js";

export type RemoveProfileClient = {
  status(target: RouteTarget, refresh: boolean): Promise<PilotStatus>;
  removeProfile(ownerAgentId: string, profileId: string): Promise<void>;
};

function removableProfile(status: PilotStatus, profileId: string): QuotaProfile {
  const profile = status.profiles.find((entry) => entry.profileId === profileId);
  if (!profile) throw new Error("This profile is no longer available. Refresh the profile list.");
  if (!profileId.startsWith("openai:")) throw new Error("Only OpenAI profiles can be removed here.");
  if (profile.active || status.activeProfileId === profileId || status.selectedProfileId === profileId) {
    throw new Error("Switch this session to another profile before removing its active or selected profile.");
  }
  return profile;
}

/** Recheck the exact target after confirmation; never delete from cached UI state. */
export async function removeProfileWithConfirmation(
  client: RemoveProfileClient,
  target: RouteTarget,
  profileId: string,
  confirm: (profile: QuotaProfile, ownerAgentId: string) => Promise<boolean>,
): Promise<boolean> {
  const status = await client.status(target, true);
  const profile = removableProfile(status, profileId);
  const owner = status.credentialOwnerAgentId?.trim();
  if (!owner) throw new Error("The credential owner is unknown. Update the Quota Pilot backend before removing profiles.");
  if (!await confirm(profile, owner)) return false;
  const latest = await client.status(target, true);
  removableProfile(latest, profileId);
  if (latest.credentialOwnerAgentId?.trim() !== owner) {
    throw new Error("The credential owner changed. Refresh and try again.");
  }
  await client.removeProfile(owner, profileId);
  return true;
}
