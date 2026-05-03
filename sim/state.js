// State shape + reducer. Pure: (state, action) => newState.
// Mutating the underlying voxel TypedArray is acceptable because the
// reducer owns the grid; no consumer holds a reference between dispatches.

import { buildTestFloor, STARTING_POSITION } from './floor.js';
import {
  getVoxel, setVoxel, isSolid, MATERIAL,
  createChunks, bumpAffectedChunks,
} from './voxels.js';

const PLAYER_SPEED = 0.30;        // voxels per tick (~18 voxels/sec at 60Hz, ~1.8 player-heights/sec)
const PLAYER_RADIUS = 1.0;        // half-width in voxels; AABB is 2x2 in plan view
const PLAYER_HEIGHT = 10;         // voxels — full-body collision iterates this range
const TICKS_PER_SECOND = 60;

export function initialState(seed = 1) {
  const grid = buildTestFloor();
  return {
    seed: seed >>> 0,
    tick: 0,
    floor: 1,
    voxelRevision: 0,
    grid,
    chunks: createChunks(grid.width, grid.height, grid.depth),
    player: { ...STARTING_POSITION },
  };
}

export function reducer(state, action) {
  switch (action.type) {
    case 'Tick':
      return tickReducer(state, action);
    case 'DestroyVoxel':
      return destroyReducer(state, action);
    default:
      return state;
  }
}

function tickReducer(state, action) {
  const intent = action.intent || { x: 0, y: 0 };
  let { x, y, z } = state.player;

  // Cap the movement vector magnitude so diagonal isn't faster than cardinal.
  let dx = intent.x * PLAYER_SPEED;
  let dz = intent.y * PLAYER_SPEED;
  const mag = Math.hypot(dx, dz);
  if (mag > PLAYER_SPEED) {
    dx = (dx / mag) * PLAYER_SPEED;
    dz = (dz / mag) * PLAYER_SPEED;
  }

  // Per-axis collision: try X then Z so the player slides along walls.
  // Full body, not just feet — every voxel level the player occupies in y
  // is checked, so low overhangs and thick walls block the body properly.
  if (dx !== 0) {
    const nx = x + dx;
    if (!collidesAt(state.grid, nx, y, z, PLAYER_RADIUS, PLAYER_HEIGHT)) x = nx;
  }
  if (dz !== 0) {
    const nz = z + dz;
    if (!collidesAt(state.grid, x, y, nz, PLAYER_RADIUS, PLAYER_HEIGHT)) z = nz;
  }

  return {
    ...state,
    tick: state.tick + 1,
    player: { x, y, z },
  };
}

function destroyReducer(state, action) {
  const { x, y, z } = action;
  if (getVoxel(state.grid, x, y, z) === MATERIAL.AIR) return state;
  setVoxel(state.grid, x, y, z, MATERIAL.AIR);
  bumpAffectedChunks(state.chunks, x, y, z);
  return {
    ...state,
    voxelRevision: state.voxelRevision + 1,
  };
}

// Player AABB vs voxel grid. Checks every solid voxel overlapping the
// player's full-body box: footprint at (x,z) with radius r, and every
// y-level from y up to y+height.
function collidesAt(grid, x, y, z, r, height) {
  const minX = Math.floor(x - r);
  const maxX = Math.floor(x + r);
  const minZ = Math.floor(z - r);
  const maxZ = Math.floor(z + r);
  const minY = Math.floor(y);
  const maxY = Math.floor(y + height - 0.0001);
  for (let cy = minY; cy <= maxY; cy++) {
    for (let cz = minZ; cz <= maxZ; cz++) {
      for (let cx = minX; cx <= maxX; cx++) {
        if (isSolid(getVoxel(grid, cx, cy, cz))) return true;
      }
    }
  }
  return false;
}

export const SIM = {
  TICKS_PER_SECOND,
  TICK_DT_MS: 1000 / TICKS_PER_SECOND,
  PLAYER_RADIUS,
  PLAYER_HEIGHT,
};
