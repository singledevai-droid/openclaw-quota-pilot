import type { PilotConfig, QuotaProfile, RoutingDecision } from "./types.js";

function remaining(profile: QuotaProfile, key: "fiveHour" | "weekly"): number {
  return profile[key]?.remainingPercent ?? -1;
}

export function bottleneckRemaining(profile: QuotaProfile): number {
  if (!profile.usable) return -1;
  return Math.min(remaining(profile, "fiveHour"), remaining(profile, "weekly"));
}

export function scoreQuotaProfile(profile: QuotaProfile): number | null {
  const bottleneck = bottleneckRemaining(profile);
  if (bottleneck < 0) return null;
  const weekly = remaining(profile, "weekly");
  const fiveHour = remaining(profile, "fiveHour");
  return bottleneck * 10_000 + weekly * 100 + fiveHour;
}

export function rankQuotaProfiles(profiles: QuotaProfile[]): QuotaProfile[] {
  return profiles
    .map((profile) => ({ ...profile, score: scoreQuotaProfile(profile) }))
    .sort((left, right) => {
      if (left.usable !== right.usable) return left.usable ? -1 : 1;
      const scoreDifference = (right.score ?? -1) - (left.score ?? -1);
      if (scoreDifference !== 0) return scoreDifference;
      return left.profileId.localeCompare(right.profileId);
    });
}

export function decideAutomaticRouting(
  profiles: QuotaProfile[],
  activeProfileId: string | null,
  config: Pick<PilotConfig, "reservePercent" | "switchHysteresisPercent">,
): RoutingDecision {
  const ranked = rankQuotaProfiles(profiles);
  const orderedProfileIds = ranked.map((profile) => profile.profileId);
  const withSelectedFirst = (selectedProfileId: string | null): string[] => {
    if (!selectedProfileId || !orderedProfileIds.includes(selectedProfileId)) {
      return orderedProfileIds;
    }
    return [
      selectedProfileId,
      ...orderedProfileIds.filter((profileId) => profileId !== selectedProfileId),
    ];
  };
  const best = ranked.find((profile) => profile.usable) ?? null;
  const active = ranked.find((profile) => profile.profileId === activeProfileId) ?? null;

  if (!best) {
    return {
      shouldSwitch: false,
      selectedProfileId: activeProfileId,
      orderedProfileIds: withSelectedFirst(activeProfileId),
      reason: "no-usable-profile",
    };
  }
  if (!active || !active.usable) {
    return {
      shouldSwitch: best.profileId !== activeProfileId,
      selectedProfileId: best.profileId,
      orderedProfileIds: withSelectedFirst(best.profileId),
      reason: active ? "active-profile-unavailable" : "active-profile-not-found",
    };
  }
  if (best.profileId === active.profileId) {
    return {
      shouldSwitch: false,
      selectedProfileId: active.profileId,
      orderedProfileIds: withSelectedFirst(active.profileId),
      reason: "active-profile-is-best",
    };
  }

  const activeBottleneck = bottleneckRemaining(active);
  const bestBottleneck = bottleneckRemaining(best);
  const belowReserve = activeBottleneck <= config.reservePercent;
  const improvement = bestBottleneck - activeBottleneck;
  const enoughImprovement = improvement >= config.switchHysteresisPercent;

  const selectedProfileId =
    belowReserve && enoughImprovement ? best.profileId : active.profileId;
  return {
    shouldSwitch: belowReserve && enoughImprovement,
    selectedProfileId,
    orderedProfileIds: withSelectedFirst(selectedProfileId),
    reason: !belowReserve
      ? "active-profile-above-reserve"
      : !enoughImprovement
        ? "candidate-improvement-below-hysteresis"
        : "active-profile-below-reserve",
  };
}
