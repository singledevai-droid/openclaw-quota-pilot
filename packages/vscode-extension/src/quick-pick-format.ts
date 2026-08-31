import type { QuotaProfile } from "./types.js";

export function profileQuickPickLabel(
  profile: Pick<QuotaProfile, "active" | "label">,
): string {
  return profile.active ? `✅ ${profile.label}` : profile.label;
}
