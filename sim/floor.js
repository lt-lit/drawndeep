// Hand-authored test floor for Stage 0. Stage 1 will replace this with
// a procgen pipeline driven by the seeded RNG.
//
// Voxel scale: a "logical cell" (the procgen tile in the design doc) is
// expected to expand to 4-6 voxels per side. The hand-authored layout
// below already lives at that voxel density:
//   - player is 10 voxels tall
//   - walls are 14 voxels tall and 3 voxels thick
//   - props (crates, altars, pillars) are 3-7 voxels per side

import { createGrid, setVoxel, MATERIAL } from './voxels.js';

const W = 96;
const H = 16;
const D = 96;
const WALL_TOP = 14;
const WALL_THICKNESS = 3;
const DOOR_HEIGHT = 11;

export const FLOOR_SIZE = { width: W, height: H, depth: D };

export function buildTestFloor() {
  const grid = createGrid(W, H, D);

  fillBox(grid, 0, 0, 0, W - 1, 0, D - 1, MATERIAL.DIRT); // floor

  buildPerimeter(grid);
  buildPartition(grid, /*z=*/ 48, /*doorCx=*/ W / 2, /*doorWidth=*/ 7);

  // South room (player spawns here)
  placePillar(grid, 12, 12);
  placePillar(grid, W - 15, 12);
  placePillar(grid, 12, 38);
  placePillar(grid, W - 15, 38);
  placeCrateStack(grid, 22, 18);
  placeAltar(grid, W / 2, 12);
  placeWaterPool(grid, 64, 16, 12, 10);

  // North room
  placePillar(grid, 12, 60);
  placePillar(grid, W - 15, 60);
  placePillar(grid, 12, 84);
  placePillar(grid, W - 15, 84);
  placeCrateStack(grid, 18, 70);
  placeAltar(grid, W / 2, 78);
  placeStatue(grid, W - 24, 76);

  return grid;
}

function fillBox(grid, x0, y0, z0, x1, y1, z1, mat) {
  for (let z = z0; z <= z1; z++) {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        setVoxel(grid, x, y, z, mat);
      }
    }
  }
}

// 3-thick perimeter walls.
function buildPerimeter(grid) {
  // South wall (z = 0..2)
  fillBox(grid, 0, 1, 0, W - 1, WALL_TOP, WALL_THICKNESS - 1, MATERIAL.STONE);
  // North wall (z = D-3..D-1)
  fillBox(grid, 0, 1, D - WALL_THICKNESS, W - 1, WALL_TOP, D - 1, MATERIAL.STONE);
  // West wall (x = 0..2)
  fillBox(grid, 0, 1, 0, WALL_THICKNESS - 1, WALL_TOP, D - 1, MATERIAL.STONE);
  // East wall (x = W-3..W-1)
  fillBox(grid, W - WALL_THICKNESS, 1, 0, W - 1, WALL_TOP, D - 1, MATERIAL.STONE);
}

// 3-thick partition wall with a doorway carved out.
function buildPartition(grid, z, doorCx, doorWidth) {
  fillBox(
    grid,
    WALL_THICKNESS, 1, z,
    W - 1 - WALL_THICKNESS, WALL_TOP, z + WALL_THICKNESS - 1,
    MATERIAL.STONE,
  );
  const doorHalf = (doorWidth / 2) | 0;
  fillBox(
    grid,
    doorCx - doorHalf, 1, z,
    doorCx + doorHalf, DOOR_HEIGHT, z + WALL_THICKNESS - 1,
    MATERIAL.AIR,
  );
}

// 3x3 pillar with a 5x5 capital. Centre is at (cx, cz).
function placePillar(grid, cx, cz) {
  fillBox(grid, cx - 1, 1, cz - 1, cx + 1, WALL_TOP - 2, cz + 1, MATERIAL.STONE);
  fillBox(grid, cx - 2, WALL_TOP - 1, cz - 2, cx + 2, WALL_TOP, cz + 2, MATERIAL.STONE);
}

// Big 5³ crate, medium 3³ crate, small 2³ crate stacked together.
function placeCrateStack(grid, x, z) {
  fillBox(grid, x,     1, z,     x + 4, 5, z + 4, MATERIAL.WOOD); // big
  fillBox(grid, x + 5, 1, z + 1, x + 7, 3, z + 3, MATERIAL.WOOD); // medium
  fillBox(grid, x + 1, 6, z + 1, x + 2, 7, z + 2, MATERIAL.WOOD); // small on top
}

// Stepped stone altar — knee-high to a 10-voxel character.
function placeAltar(grid, cx, cz) {
  fillBox(grid, cx - 2, 1, cz - 2, cx + 2, 4, cz + 2, MATERIAL.STONE); // 5x4x5 base
  fillBox(grid, cx - 1, 5, cz - 1, cx + 1, 5, cz + 1, MATERIAL.STONE); // 3x1x3 slab
  setVoxel(grid, cx, 6, cz, MATERIAL.STONE);                           // cap
}

// Tall stone statue (~12 voxels tall — a head taller than the player).
function placeStatue(grid, cx, cz) {
  fillBox(grid, cx - 2, 1, cz - 2, cx + 2, 2, cz + 2, MATERIAL.STONE); // pedestal
  fillBox(grid, cx - 1, 3, cz - 1, cx + 1, 9, cz + 1, MATERIAL.STONE); // body
  fillBox(grid, cx - 1, 10, cz - 1, cx + 1, 11, cz + 1, MATERIAL.STONE); // head
}

function placeWaterPool(grid, x, z, w, d) {
  fillBox(grid, x, 0, z, x + w - 1, 0, z + d - 1, MATERIAL.WATER);
}

// Starting position — south room, middle, on top of the floor.
export const STARTING_POSITION = { x: W / 2, y: 1, z: D - 14 };
