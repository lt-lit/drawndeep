// State shape + reducer. Pure: (state, action) => newState.
// Mutating the underlying voxel TypedArray is acceptable because the
// reducer owns the grid; no consumer holds a reference between dispatches.

import { buildTestFloor, STARTING_POSITION } from './floor.js';
import {
  getVoxel, setVoxel, MATERIAL,
  createChunks, bumpAffectedChunks,
} from './voxels.js';
import { walkableMove, groundHeight, STEP_UP } from './walkable.js';

const PLAYER_SPEED = 0.30;        // voxels per tick (~18 voxels/sec at 60Hz, ~1.8 player-heights/sec)
const PLAYER_RADIUS = 1.0;        // half-width in voxels; footprint is 2x2 in plan view
const PLAYER_HEIGHT = 10;         // voxels — body clearance checks iterate this range
const TICKS_PER_SECOND = 60;
const GRAVITY = 0.05;             // voxels/tick² — snappy arcade fall, ~0.2s for a 4-voxel drop
const MAX_FALL = 1.2;             // voxels/tick terminal velocity

export function initialState(seed = 1) {
  const grid = buildTestFloor();
  return {
    seed: seed >>> 0,
    tick: 0,
    floor: 1,
    voxelRevision: 0,
    grid,
    chunks: createChunks(grid.width, grid.height, grid.depth),
    player: { ...STARTING_POSITION, vy: 0 },
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
  let { x, y, z, vy } = state.player;
  const grid = state.grid;

  // Cap the movement vector magnitude so diagonal isn't faster than cardinal.
  let dx = intent.x * PLAYER_SPEED;
  let dz = intent.y * PLAYER_SPEED;
  const mag = Math.hypot(dx, dz);
  if (mag > PLAYER_SPEED) {
    dx = (dx / mag) * PLAYER_SPEED;
    dz = (dz / mag) * PLAYER_SPEED;
  }

  // Walkable-height movement: each axis move may step up ≤ STEP_UP (only
  // while grounded — no ledge-snapping mid-fall) and slides on block.
  const grounded = y <= groundHeight(grid, x, z, PLAYER_RADIUS, y) + 1e-6;
  const stepUp = grounded ? STEP_UP : 0;
  if (dx !== 0) {
    const feet = walkableMove(grid, x + dx, z, y, PLAYER_RADIUS, PLAYER_HEIGHT, stepUp);
    if (feet !== null) {
      x += dx;
      y = feet;
    }
  }
  if (dz !== 0) {
    const feet = walkableMove(grid, x, z + dz, y, PLAYER_RADIUS, PLAYER_HEIGHT, stepUp);
    if (feet !== null) {
      z += dz;
      y = feet;
    }
  }

  // Gravity: free drop of any height, no fall damage in v1. Walking off
  // an edge (or losing the voxel underfoot to destruction) starts a fall.
  const ground = groundHeight(grid, x, z, PLAYER_RADIUS, y);
  if (y > ground + 1e-6) {
    vy = Math.max(vy - GRAVITY, -MAX_FALL);
    y += vy;
    if (y <= ground) {
      y = ground;
      vy = 0;
    }
  } else {
    y = ground;
    vy = 0;
  }

  return {
    ...state,
    tick: state.tick + 1,
    player: { x, y, z, vy },
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

export const SIM = {
  TICKS_PER_SECOND,
  TICK_DT_MS: 1000 / TICKS_PER_SECOND,
  PLAYER_RADIUS,
  PLAYER_HEIGHT,
};
