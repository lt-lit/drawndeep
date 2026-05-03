// State shape + reducer. Pure: (state, action) => newState.
// Mutating the underlying voxel TypedArray is acceptable because the
// reducer owns the grid; no consumer holds a reference between dispatches.

import { buildTestFloor, STARTING_POSITION } from './floor.js';
import { getVoxel, setVoxel, isSolid, MATERIAL } from './voxels.js';

const PLAYER_SPEED = 0.22;        // voxels per tick (~13 voxels/sec at 60Hz)
const PLAYER_RADIUS = 0.5;
const TICKS_PER_SECOND = 60;

export function initialState(seed = 1) {
  return {
    seed: seed >>> 0,
    tick: 0,
    floor: 1,
    voxelRevision: 0,                // bumped whenever the grid changes; render uses this to know when to remesh
    grid: buildTestFloor(),
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
  if (dx !== 0) {
    const nx = x + dx;
    if (!collidesAt(state.grid, nx, y, z, PLAYER_RADIUS)) x = nx;
  }
  if (dz !== 0) {
    const nz = z + dz;
    if (!collidesAt(state.grid, x, y, nz, PLAYER_RADIUS)) z = nz;
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
  return {
    ...state,
    voxelRevision: state.voxelRevision + 1,
  };
}

// Player AABB vs voxel grid. Checks every solid voxel overlapping the
// player's footprint at the given (x, z) and the floor at y.
function collidesAt(grid, x, y, z, r) {
  const minX = Math.floor(x - r);
  const maxX = Math.floor(x + r);
  const minZ = Math.floor(z - r);
  const maxZ = Math.floor(z + r);
  // Player occupies one voxel of vertical space starting at floor y=1.
  const checkY = Math.floor(y);
  for (let cz = minZ; cz <= maxZ; cz++) {
    for (let cx = minX; cx <= maxX; cx++) {
      if (isSolid(getVoxel(grid, cx, checkY, cz))) return true;
    }
  }
  return false;
}

export const SIM = {
  TICKS_PER_SECOND,
  TICK_DT_MS: 1000 / TICKS_PER_SECOND,
  PLAYER_RADIUS,
};
