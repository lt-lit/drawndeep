// Per-column walkable-height movement rules (design doc Part 1, "Light
// verticality"): the player stands on the highest solid voxel top
// reachable from their current height, can step up ≤ STEP_UP, and can
// drop any height (gravity lives in the reducer; no fall damage in v1).
//
// Heights are scanned on demand rather than cached in a heightmap
// array: a movement query touches a handful of columns and a few
// voxels each, and scanning live means voxel destruction updates
// walkability with no invalidation bookkeeping — dig a hole, fall in.

import { getVoxel, isSolid } from './voxels.js';

export const STEP_UP = 2;

// Feet height offered by the column containing (xVoxel, zVoxel),
// scanning down from fromY: the top of the highest solid voxel at or
// below that level. Implicit bedrock below y=0 bounds the scan.
export function supportHeight(grid, xVoxel, zVoxel, fromY) {
  for (let y = Math.min(Math.floor(fromY), grid.height - 1); y >= -1; y--) {
    if (isSolid(getVoxel(grid, xVoxel, y, zVoxel))) return y + 1;
  }
  return 0;
}

// Highest support under a footprint of radius r centred at (x, z) —
// the feet height the player would stand at there.
export function groundHeight(grid, x, z, r, fromY) {
  const minX = Math.floor(x - r);
  const maxX = Math.floor(x + r);
  const minZ = Math.floor(z - r);
  const maxZ = Math.floor(z + r);
  let ground = 0;
  for (let cz = minZ; cz <= maxZ; cz++) {
    for (let cx = minX; cx <= maxX; cx++) {
      const s = supportHeight(grid, cx, cz, fromY);
      if (s > ground) ground = s;
    }
  }
  return ground;
}

// True if a body of the given height standing with feet at feetY,
// footprint radius r centred at (x, z), intersects no solid voxel.
// Catches low doorway tops and overhangs that support alone misses.
export function bodyFits(grid, x, feetY, z, r, height) {
  const minX = Math.floor(x - r);
  const maxX = Math.floor(x + r);
  const minZ = Math.floor(z - r);
  const maxZ = Math.floor(z + r);
  const minY = Math.floor(feetY);
  const maxY = Math.floor(feetY + height - 0.0001);
  for (let cy = minY; cy <= maxY; cy++) {
    for (let cz = minZ; cz <= maxZ; cz++) {
      for (let cx = minX; cx <= maxX; cx++) {
        if (isSolid(getVoxel(grid, cx, cy, cz))) return false;
      }
    }
  }
  return true;
}

// Resolve an attempted horizontal move to (nx, nz) for a player whose
// feet are at feetY. Returns the feet height after the move (stepping
// up happens instantly, stepping down does not — the reducer's gravity
// handles drops), or null if the move is blocked. Pass stepUp = 0 while
// airborne so falling players don't ledge-snap upward.
export function walkableMove(grid, nx, nz, feetY, r, height, stepUp) {
  const ground = groundHeight(grid, nx, nz, r, feetY + stepUp);
  if (ground > feetY + stepUp + 1e-6) return null;
  const newFeet = Math.max(feetY, ground);
  if (!bodyFits(grid, nx, newFeet, nz, r, height)) return null;
  return newFeet;
}
