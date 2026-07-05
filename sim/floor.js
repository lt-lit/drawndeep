// Hand-authored test floor for Stage 1. Besides the Stage-0 furniture it
// now proves every traversal rule: stepped terraces climbing in ≤2-voxel
// increments, free drops off their edges, a 4-deep sunken pit (beyond
// the step-up limit — falling in commits you to the stepped escape),
// climbable crates, and a shallow wading pool. Replaced by the template
// assembler in Stage 3.
//
// Voxel scale (design doc): player ~10 tall, walls 14 tall and 3 thick,
// doorways ≥7 wide / ≥11 tall, step-up ≤2, platforms 3–6 above floor.

import { createGrid, setVoxel, MATERIAL } from './voxels.js';

const W = 96;
const H = 24;
const D = 96;
export const GROUND = 4;              // feet level on the main floor; slab fills y=0..3
const WALL_TOP = GROUND + 13;         // walls 14 voxels tall above the slab
const WALL_THICKNESS = 3;
const DOOR_HEIGHT = 11;

export const FLOOR_SIZE = { width: W, height: H, depth: D };

export function buildTestFloor() {
  const grid = createGrid(W, H, D);

  // 4-thick floor slab so the sunken pit has real depth to dig into.
  fillBox(grid, 0, 0, 0, W - 1, GROUND - 1, D - 1, MATERIAL.DIRT);

  buildPerimeter(grid);
  buildPartition(grid, /*z=*/ 48, /*doorCx=*/ W / 2, /*doorWidth=*/ 7);

  // Far room (z < 48)
  placePillar(grid, 12, 12);
  placePillar(grid, W - 15, 12);
  placePillar(grid, 12, 38);
  placePillar(grid, W - 15, 38);
  placeCrateStack(grid, 22, 18);
  placeAltar(grid, W / 2, 12);
  placeWadingPool(grid, 64, 16, 12, 10);

  // Spawn room (z > 51)
  placeTerraces(grid);
  placeSunkenPit(grid);
  placePillar(grid, W - 15, 60);
  placePillar(grid, W - 15, 84);
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
  fillBox(grid, 0, GROUND, 0, W - 1, WALL_TOP, WALL_THICKNESS - 1, MATERIAL.STONE);
  fillBox(grid, 0, GROUND, D - WALL_THICKNESS, W - 1, WALL_TOP, D - 1, MATERIAL.STONE);
  fillBox(grid, 0, GROUND, 0, WALL_THICKNESS - 1, WALL_TOP, D - 1, MATERIAL.STONE);
  fillBox(grid, W - WALL_THICKNESS, GROUND, 0, W - 1, WALL_TOP, D - 1, MATERIAL.STONE);
}

// 3-thick partition wall with a doorway carved out.
function buildPartition(grid, z, doorCx, doorWidth) {
  fillBox(
    grid,
    WALL_THICKNESS, GROUND, z,
    W - 1 - WALL_THICKNESS, WALL_TOP, z + WALL_THICKNESS - 1,
    MATERIAL.STONE,
  );
  const doorHalf = (doorWidth / 2) | 0;
  fillBox(
    grid,
    doorCx - doorHalf, GROUND, z,
    doorCx + doorHalf, GROUND + DOOR_HEIGHT - 1, z + WALL_THICKNESS - 1,
    MATERIAL.AIR,
  );
}

// Three stone terraces climbing the west wall of the spawn room in
// +2-voxel steps (exactly the step-up limit) to a +6 overlook — the
// "loot perch requiring a detour" pattern. Approaching from the east
// face of the top terrace is a 6-voxel wall; the climb starts at the
// north strip.
function placeTerraces(grid) {
  terrace(grid, 4, 64, 18, 71, GROUND + 2);
  terrace(grid, 4, 72, 18, 79, GROUND + 4);
  terrace(grid, 4, 80, 18, 87, GROUND + 6);
  // Crate on the overlook: visible from below, reachable only by the climb.
  fillBox(grid, 8, GROUND + 6, 82, 9, GROUND + 7, 83, MATERIAL.WOOD);
}

function terrace(grid, x0, z0, x1, z1, feetLevel) {
  fillBox(grid, x0, GROUND, z0, x1, feetLevel - 1, z1, MATERIAL.STONE);
}

// Sunken pit: the slab dug out to bedrock, 4 deep. A 2-high stone block
// in the NW corner gives the two-step exit: pit floor → block (+2) →
// rim (+2). Everywhere else the rim is unclimbable.
function placeSunkenPit(grid) {
  fillBox(grid, 54, 0, 60, 68, GROUND - 1, 74, MATERIAL.AIR);
  fillBox(grid, 54, 0, 60, 56, 1, 62, MATERIAL.STONE);
}

// 3x3 pillar with a 5x5 capital. Centre is at (cx, cz).
function placePillar(grid, cx, cz) {
  fillBox(grid, cx - 1, GROUND, cz - 1, cx + 1, WALL_TOP - 2, cz + 1, MATERIAL.STONE);
  fillBox(grid, cx - 2, WALL_TOP - 1, cz - 2, cx + 2, WALL_TOP, cz + 2, MATERIAL.STONE);
}

// Crate stack sized as climbable stairs: floor → medium (+2) → big (+4)
// → small crate top (+6), every step within the step-up limit.
function placeCrateStack(grid, x, z) {
  fillBox(grid, x, GROUND, z, x + 4, GROUND + 3, z + 4, MATERIAL.WOOD);         // big (4 high)
  fillBox(grid, x + 5, GROUND, z + 1, x + 7, GROUND + 1, z + 3, MATERIAL.WOOD); // medium (2 high)
  fillBox(grid, x + 1, GROUND + 4, z + 1, x + 2, GROUND + 5, z + 2, MATERIAL.WOOD); // small on top
}

// Stepped stone altar — knee-high to a 10-voxel character.
function placeAltar(grid, cx, cz) {
  fillBox(grid, cx - 2, GROUND, cz - 2, cx + 2, GROUND + 3, cz + 2, MATERIAL.STONE); // 5x4x5 base
  fillBox(grid, cx - 1, GROUND + 4, cz - 1, cx + 1, GROUND + 4, cz + 1, MATERIAL.STONE); // slab
  setVoxel(grid, cx, GROUND + 5, cz, MATERIAL.STONE);                                 // cap
}

// Tall stone statue (~12 voxels — a head taller than the player).
function placeStatue(grid, cx, cz) {
  fillBox(grid, cx - 2, GROUND, cz - 2, cx + 2, GROUND + 1, cz + 2, MATERIAL.STONE); // pedestal
  fillBox(grid, cx - 1, GROUND + 2, cz - 1, cx + 1, GROUND + 8, cz + 1, MATERIAL.STONE); // body
  fillBox(grid, cx - 1, GROUND + 9, cz - 1, cx + 1, GROUND + 10, cz + 1, MATERIAL.STONE); // head
}

// Water replaces the slab's top layer: not walkable support, so the
// pool reads as sunken floor — wade in (drop 1), step back out (≤2).
function placeWadingPool(grid, x, z, w, d) {
  fillBox(grid, x, GROUND - 1, z, x + w - 1, GROUND - 1, z + d - 1, MATERIAL.WATER);
}

// Starting position — spawn room, middle, on top of the slab.
export const STARTING_POSITION = { x: W / 2, y: GROUND, z: D - 14 };
