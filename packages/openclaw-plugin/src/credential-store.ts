import {
  loadAuthProfileStoreForRuntime,
  type AuthProfileStore,
} from "openclaw/plugin-sdk/agent-runtime";

import type {
  CredentialInventory,
  CredentialRecord,
  PluginLoggerLike,
} from "./types.js";
import { credentialIdentityError, tokenIdentity } from "./credential-identity.js";

function normalizeTimestamp(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return value < 10_000_000_000 ? Math.round(value * 1000) : Math.round(value);
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.length > 0)
    : [];
}

export function credentialInventoryFromStore(
  store: AuthProfileStore,
): CredentialInventory {
  const profiles: CredentialRecord[] = [];
  for (const [profileId, raw] of Object.entries(store.profiles)) {
    if (
      raw.provider !== "openai" ||
      raw.type !== "oauth" ||
      typeof raw.access !== "string" ||
      raw.access.length === 0
    ) {
      continue;
    }
    const identity = tokenIdentity(raw.access);
    const email = nullableString(raw.email);
    const accountId = nullableString(raw.accountId);
    profiles.push({
      profileId,
      provider: "openai",
      email,
      accessToken: raw.access,
      accountId: accountId ?? identity.accountId,
      expiresAt: normalizeTimestamp(raw.expires),
      planHint: nullableString(raw.chatgptPlanType),
      identityError: credentialIdentityError(profileId, email, accountId, identity),
    });
  }

  // One authenticated person/account is one quota pool, regardless of how many
  // aliases or independently minted tokens were saved. Keep the canonical ID.
  const identities = new Set<string>();
  const canonicalFirst = [...profiles].sort((a, b) => {
    const canonical = (p: CredentialRecord) =>
      p.profileId.toLowerCase() === `openai:${p.email?.toLowerCase()}` ? 0 : 1;
    return canonical(a) - canonical(b) || a.profileId.localeCompare(b.profileId);
  });
  for (const profile of canonicalFirst) {
    if (profile.identityError) continue;
    if (profile.expiresAt !== null && profile.expiresAt <= Date.now()) continue;
    const identity = tokenIdentity(profile.accessToken);
    const email = identity.email ?? profile.email?.toLowerCase();
    const account = identity.accountId ?? profile.accountId;
    if (!email || !account) continue;
    const key = JSON.stringify([email, account]);
    if (identities.has(key)) profile.identityError = "duplicate-account-profile";
    else identities.add(key);
  }

  const configuredOrder = stringArray(store.order?.openai).filter((profileId) =>
    profiles.some((profile) => profile.profileId === profileId),
  );
  const lastGood = nullableString(store.lastGood?.openai);
  return {
    profiles,
    configuredOrder,
    lastGoodProfileId:
      lastGood && profiles.some((profile) => profile.profileId === lastGood)
        ? lastGood
        : null,
  };
}

export function readOpenAiCredentialInventory(
  agentDir: string,
  logger?: PluginLoggerLike,
): CredentialInventory {
  try {
    const store = loadAuthProfileStoreForRuntime(agentDir, {
      readOnly: true,
      allowKeychainPrompt: false,
      externalCli: { mode: "none" },
    });
    return credentialInventoryFromStore(store);
  } catch (error) {
    logger?.error("quota-pilot failed to read the OpenClaw runtime credential store", {
      agentDir,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
