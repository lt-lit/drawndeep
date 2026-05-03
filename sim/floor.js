// Floor-build orchestrator. Picks dimensions, calls procgen, returns the
// grid + a walkable spawn position.
//
// Floor stays at 96×96 for now (the design doc allows 96 for early
// prototyping; full target is 200-400). Bump FLOOR_W/FLOOR_D once procgen
// quality is solid and chunked meshing has been measured at scale.

import { generateFloor } from './procgen.js';

const FLOOR_W = 96;
const FLOOR_H = 16;
const FLOOR_D = 96;

export const FLOOR_SIZE = { width: FLOOR_W, height: FLOOR_H, depth: FLOOR_D };

export function buildFloor(seed) {
  const { grid, spawn } = generateFloor(FLOOR_W, FLOOR_D, FLOOR_H, seed);
  return {
    grid,
    startingPosition: { x: spawn.x, y: 1, z: spawn.z },
  };
}
