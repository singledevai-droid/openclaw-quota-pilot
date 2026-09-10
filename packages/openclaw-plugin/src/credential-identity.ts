type Identity = { email: string | null; accountId: string | null };

const normalized = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim().toLowerCase() : null;
const opaqueId = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

// Claims are only a local consistency check, never proof of authentication.
// The provider still validates the bearer token on every quota request.
export function tokenIdentity(access: string): Identity {
  try {
    const claims = JSON.parse(Buffer.from(access.split(".")[1] ?? "", "base64url").toString());
    return {
      email: normalized(claims["https://api.openai.com/profile"]?.email ?? claims.email),
      accountId: opaqueId(claims["https://api.openai.com/auth"]?.chatgpt_account_id),
    };
  } catch {
    return { email: null, accountId: null };
  }
}

export function credentialIdentityError(
  profileId: string,
  email: string | null,
  accountId: string | null,
  identity: Identity,
): string | null {
  const namedEmail = profileId.replace(/^openai:/, "");
  const expected = namedEmail.includes("@") ? normalized(namedEmail) : null;
  const stored = normalized(email);
  if (
    (expected && stored && expected !== stored) ||
    (expected && identity.email && expected !== identity.email) ||
    (stored && identity.email && stored !== identity.email) ||
    (accountId && identity.accountId && opaqueId(accountId) !== identity.accountId)
  ) return "profile-identity-mismatch";
  return null;
}
