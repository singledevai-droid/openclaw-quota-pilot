#!/usr/bin/env bash
set -euo pipefail

STATUS_JSON="$(mktemp)"
trap 'rm -f "$STATUS_JSON"' EXIT

openclaw gateway call quota-pilot.status \
  --json \
  --timeout 15000 \
  --params '{"agentId":"main","sessionKey":"agent:main:main","refresh":true}' \
  >"$STATUS_JSON"

node --input-type=module - "$STATUS_JSON" <<'NODE'
import { readFileSync } from "node:fs";

const text = readFileSync(process.argv[2], "utf8").trim();
const parsed = JSON.parse(text);
const payload = parsed.result ?? parsed.payload ?? parsed;
if (!Array.isArray(payload.profiles) || payload.profiles.length === 0) {
  throw new Error("No OpenAI profiles returned by Quota Pilot");
}
const serialized = JSON.stringify(payload).toLowerCase();
for (const forbidden of ["accesstoken", "refresh_token", "accountid", "bearer "]) {
  if (serialized.includes(forbidden)) {
    throw new Error(`Secret boundary violation: RPC contains ${forbidden}`);
  }
}
console.log(
  JSON.stringify(
    {
      ok: true,
      mode: payload.mode,
      activeProfileId: payload.activeProfileId,
      profiles: payload.profiles.map((profile) => ({
        profileId: profile.profileId,
        fiveHourRemaining: profile.fiveHour?.remainingPercent ?? null,
        weeklyRemaining: profile.weekly?.remainingPercent ?? null,
        usable: profile.usable,
      })),
    },
    null,
    2,
  ),
);
NODE
