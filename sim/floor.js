// Hand-authored test floor for Stage 0. Stage 1 will replace this with
// a procgen pipeline driven by the seeded RNG.
//
// Note on scale: voxels are intentionally small relative to the player.
// At this density a "logical cell" (the procgen tile in the design doc)
// will eventually expand to 4-6 voxels per side. The test floor below
// already builds in that voxel density — walls are 10 voxels tall, the
// player is ~6 voxels tall, and props (crates, altars) are 2-4 voxels.

import { createGrid, setVoxel, MATERIAL } from './voxels.js';

const W = 64;
const H = 16;
const D = 64;
const WALL_TOP = 10;

export const FLOOR_SIZE = { width: W, height: H, depth: D };

export function buildTestFloor() {
  const grid = createGrid(W, H, D);

  fillFloor(grid);
  buildPerimeterWalls(grid);
  buildPartition(grid, /*z=*/ 26, /*doorX=*/ 30, /*doorWidth=*/ 4, /*height=*/ 8);
  placePillars(grid);
  placeCrateStack(grid, 18, 12);
  placeCrateStack(grid, 46, 14);
  placeAltar(grid, W / 2, 8);
  placeWaterPool(grid, 40, 8, 8, 6);

  return grid;
}

function fillFloor(grid) {
  for (let z = 0; z < D; z++) {
    for (let x = 0; x < W; x++) {
      setVoxel(grid, x, 0, z, MATERIAL.DIRT);
    }
  }
}

function buildPerimeterWalls(grid) {
  for (let y = 1; y <= WALL_TOP; y++) {
    for (let x = 0; x < W; x++) {
      setVoxel(grid, x, y, 0, MATERIAL.STONE);
      setVoxel(grid, x, y, D - 1, MATERIAL.STONE);
    }
    for (let z = 0; z < D; z++) {
      setVoxel(grid, 0, y, z, MATERIAL.STONE);
      setVoxel(grid, W - 1, y, z, MATERIAL.STONE);
    }
  }
}

function buildPartition(grid, z, doorX, doorWidth, height) {
  for (let y = 1; y <= height; y++) {
    for (let x = 8; x < W - 8; x++) {
      const inDoor = x >= doorX && x < doorX + doorWidth && y <= height - 2;
      if (inDoor) continue;
      setVoxel(grid, x, y, z, MATERIAL.STONE);
    }
  }
}

function placePillars(grid) {
  const positions = [
    [12, 14], [12, 38],
    [W - 13, 14], [W - 13, 38],
    [W / 2 | 0, 44],
  ];
  for (const [px, pz] of positions) {
    for (let y = 1; y <= 8; y++) {
      setVoxel(grid, px, y, pz, MATERIAL.STONE);
    }
    // Capital — wider top voxel ring
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        setVoxel(grid, px + dx, 8, pz + dz, MATERIAL.STONE);
      }
    }
  }
}

// 3-voxel chunky crate beside a 2-voxel one beside a 1-voxel one.
// This is what destructible voxel "furniture" looks like at this resolution.
function placeCrateStack(grid, x, z) {
  // Big crate: 3x3x3
  for (let dy = 0; dy < 3; dy++) {
    for (let dz = 0; dz < 3; dz++) {
      for (let dx = 0; dx < 3; dx++) {
        setVoxel(grid, x + dx, 1 + dy, z + dz, MATERIAL.WOOD);
      }
    }
  }
  // Medium crate beside it: 2x2x2
  for (let dy = 0; dy < 2; dy++) {
    for (let dz = 0; dz < 2; dz++) {
      for (let dx = 0; dx < 2; dx++) {
        setVoxel(grid, x + 3, 1 + dy, z + dz, MATERIAL.WOOD);
        setVoxel(grid, x + 4, 1 + dy, z + dz, MATERIAL.WOOD);
      }
    }
  }
  // Small crate on top of the big one: 1x1x1
  setVoxel(grid, x + 1, 4, z + 1, MATERIAL.WOOD);
}

// Stone altar: 3-wide base, 1-voxel slab on top.
function placeAltar(grid, cx, cz) {
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      setVoxel(grid, cx + dx, 1, cz + dz, MATERIAL.STONE);
      setVoxel(grid, cx + dx, 2, cz + dz, MATERIAL.STONE);
    }
  }
  // Slab a bit narrower
  for (let dx = -1; dx <= 1; dx++) {
    setVoxel(grid, cx + dx, 3, cz, MATERIAL.STONE);
  }
  setVoxel(grid, cx, 4, cz, MATERIAL.STONE);
}

function placeWaterPool(grid, x, z, w, d) {
  for (let dz = 0; dz < d; dz++) {
    for (let dx = 0; dx < w; dx++) {
      setVoxel(grid, x + dx, 0, z + dz, MATERIAL.WATER);
    }
  }
}

// Starting position — south room, middle, on top of the floor.
export const STARTING_POSITION = { x: W / 2, y: 1, z: D - 10 };
