// Hand-authored test floor for Stage 0. Stage 1 will replace this with
// a procgen pipeline driven by the seeded RNG.
//
// Note on scale: voxels are intentionally small relative to the player.
// A "logical cell" (the procgen tile in the design doc) will eventually
// expand to several voxels per side (probably 4³ to 6³). The hand-authored
// layout below already builds in that voxel density — walls are 8 voxels
// tall, the player is ~4 voxels tall, etc.

import { createGrid, setVoxel, MATERIAL } from './voxels.js';

const W = 48;
const H = 12;
const D = 48;
const WALL_TOP = 8;

export const FLOOR_SIZE = { width: W, height: H, depth: D };

export function buildTestFloor() {
  const grid = createGrid(W, H, D);

  // Floor of dirt at y=0
  for (let z = 0; z < D; z++) {
    for (let x = 0; x < W; x++) {
      setVoxel(grid, x, 0, z, MATERIAL.DIRT);
    }
  }

  // Perimeter stone walls
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

  // Interior partition wall with a doorway 3 voxels wide
  const partitionZ = 18;
  const doorStart = 22;
  const doorEnd = 25;
  for (let y = 1; y <= 6; y++) {
    for (let x = 8; x < W - 8; x++) {
      if (x >= doorStart && x <= doorEnd && y <= 5) continue;
      setVoxel(grid, x, y, partitionZ, MATERIAL.STONE);
    }
  }

  // Stone pillars, 6 tall
  const pillars = [
    [10, 10], [10, 30],
    [W - 11, 10], [W - 11, 30],
    [W / 2 | 0, 32], [W / 2 | 0, 8],
  ];
  for (const [px, pz] of pillars) {
    for (let y = 1; y <= 6; y++) {
      setVoxel(grid, px, y, pz, MATERIAL.STONE);
    }
  }

  // Wooden crate cluster — flammable accent for later stages
  for (let dx = 0; dx < 2; dx++) {
    for (let dz = 0; dz < 2; dz++) {
      for (let dy = 0; dy < 2; dy++) {
        setVoxel(grid, 14 + dx, 1 + dy, 9 + dz, MATERIAL.WOOD);
      }
    }
  }

  // A water pool
  for (let x = 30; x <= 36; x++) {
    for (let z = 7; z <= 12; z++) {
      setVoxel(grid, x, 0, z, MATERIAL.WATER);
    }
  }

  return grid;
}

// Starting position — south room, middle, on top of the floor.
export const STARTING_POSITION = { x: W / 2, y: 1, z: D - 8 };
