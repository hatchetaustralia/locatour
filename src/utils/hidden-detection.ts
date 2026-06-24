// Single source of truth for "is a hidden spot nearby" across Home, Map (explore)
// and Camera. Before this, the camera and the map each had their OWN copy of the
// detection with DIFFERENT rules (the map treated visible locked teasers AND secret
// tiers as "hidden" and used the 20m check-in radius), so the same place could read
// as hidden on one screen and not another. Everything routes through here now.

import { Coordinates, ExploreLocation } from '@/types';
import {
  unlockedTier,
  LOCK_TEASER_RANGE,
} from '@/utils/leveling';
import { getConfig, tierRadiusBoost } from '@/utils/runtime-config';

/** Great-circle distance in metres. The one shared Haversine (there were three). */
export function distanceMeters(a: Coordinates, b: Coordinates): number {
  const toRad = (x: number) => (x * Math.PI) / 180;
  const R = 6371000; // Earth radius, metres
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/** The nearest genuinely-hidden, undiscovered spot plus its proximity bands. */
export interface HiddenNearby {
  spot: ExploreLocation;
  distanceM: number; // rounded metres
  inRange: boolean; // within HIDDEN_RADIUS_M — close enough to reach/unlock
  warm: boolean; // within WARM_RADIUS_M — close enough to tease ("something nearby")
}

/** A checkable spot (unlocked, or a hidden one already discovered) + its distance. */
export interface CheckableNearby {
  spot: ExploreLocation;
  distanceM: number;
}

export interface NearbyClassification {
  checkable: CheckableNearby | null;
  hidden: HiddenNearby | null;
}

/**
 * Classify the spots around `here` for a player at `level` into the nearest
 * CHECKABLE spot and the nearest undiscovered HIDDEN spot.
 *
 * Tier bands (single definition):
 *   tier <= unlockedTier ................. unlocked → checkable
 *   unlockedTier+1 .. unlockedTier+2 ..... visible LOCKED teasers → ignored (NOT hidden)
 *   > unlockedTier+LOCK_TEASER_RANGE ...... genuinely hidden (until discovered) — NO upper
 *       tier ceiling: a remote high-tier spot is discoverable by PROXIMITY (within the
 *       boosted warm radius) regardless of how far above your tier it sits.
 *
 * A hidden spot that has been discovered (checked in = visitedIds, OR reached =
 * unlockedIds) is no longer hidden — it folds into "checkable". Pass BOTH sets so
 * every screen agrees on what counts as already-found.
 */
export function classifyNearby(
  here: Coordinates,
  locations: ExploreLocation[],
  level: number,
  opts?: { visitedIds?: Set<string>; unlockedIds?: Set<string> },
): NearbyClassification {
  const maxTier = unlockedTier(level);
  const discoveryFloor = maxTier + LOCK_TEASER_RANGE;
  const discovered = (id: string) =>
    opts?.visitedIds?.has(id) === true || opts?.unlockedIds?.has(id) === true;

  let chk: ExploreLocation | null = null;
  let chkDist = Infinity;
  let hid: ExploreLocation | null = null;
  let hidDist = Infinity;

  for (const loc of locations) {
    const d = distanceMeters(here, loc.coordinates);
    if (loc.tier > discoveryFloor) {
      // Genuinely hidden. Undiscovered → a hidden target; discovered → checkable.
      if (!discovered(loc.id)) {
        if (d < hidDist) {
          hidDist = d;
          hid = loc;
        }
      } else if (d < chkDist) {
        chkDist = d;
        chk = loc;
      }
    } else if (loc.tier <= maxTier) {
      // Unlocked → checkable.
      if (d < chkDist) {
        chkDist = d;
        chk = loc;
      }
    }
    // else: locked teaser band (unlockedTier+1/+2) — a visible pin, neither
    // checkable nor hidden; ignored.
  }

  const hidRounded = Math.round(hidDist);
  const cfg = getConfig();
  return {
    checkable: chk ? { spot: chk, distanceM: Math.round(chkDist) } : null,
    hidden: hid
      ? {
          spot: hid,
          distanceM: hidRounded,
          inRange: hidRounded <= cfg.hiddenRadiusM,
          warm: hidRounded <= cfg.warmRadiusM * tierRadiusBoost(level),
        }
      : null,
  };
}

/** Convenience: just the nearest undiscovered hidden spot (Map + Home use this). */
export function findNearestHiddenSpot(
  here: Coordinates,
  locations: ExploreLocation[],
  level: number,
  opts?: { visitedIds?: Set<string>; unlockedIds?: Set<string> },
): HiddenNearby | null {
  return classifyNearby(here, locations, level, opts).hidden;
}

/** Format a metre distance for UI: "120 m away" / "1.2 km away". */
export function formatDistanceAway(distanceM: number): string {
  if (distanceM < 1000) return `${Math.round(distanceM)} m away`;
  return `${(distanceM / 1000).toFixed(1)} km away`;
}
