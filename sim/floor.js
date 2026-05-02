// Hand-authored test floor for Stage 0. Stage 1 will replace this with
// a procgen pipeline driven by the seeded RNG.

import { createGrid, setVoxel, MATERIAL } from './voxels.js';

const W = 32;
const H = 6;
const D = 32;

export const FLOOR_SIZE = { width: W, height: H, depth: D };

export function buildTestFloor() {
  const grid = createGrid(W, H, D);

  // Floor of dirt at y=0
  for (let z = 0; z < D; z++) {
    for (let x = 0; x < W; x++) {
      setVoxel(grid, x, 0, z, MATERIAL.DIRT);
    }
  }

  // Perimeter stone walls, 4 voxels tall
  const wallTop = 4;
  for (let y = 1; y <= wallTop; y++) {
    for (let x = 0; x < W; x++) {
      setVoxel(grid, x, y, 0, MATERIAL.STONE);
      setVoxel(grid, x, y, D - 1, MATERIAL.STONE);
    }
    for (let z = 0; z < D; z++) {
      setVoxel(grid, 0, y, z, MATERIAL.STONE);
      setVoxel(grid, W - 1, y, z, MATERIAL.STONE);
    }
  }

  // Interior partition wall with a doorway
  for (let y = 1; y <= 3; y++) {
    for (let x = 6; x < W - 6; x++) {
      if (x === 14 || x === 15) continue; // doorway
      setVoxel(grid, x, y, 12, MATERIAL.STONE);
    }
  }

  // A few stone pillars
  const pillars = [
    [6, 6], [6, 22],
    [W - 7, 6], [W - 7, 22],
    [W / 2 | 0, 22],
  ];
  for (const [px, pz] of pillars) {
    for (let y = 1; y <= 4; y++) {
      setVoxel(grid, px, y, pz, MATERIAL.STONE);
    }
  }

  // A wooden crate cluster — flammable accent for later stages
  setVoxel(grid, 10, 1, 6, MATERIAL.WOOD);
  setVoxel(grid, 11, 1, 6, MATERIAL.WOOD);
  setVoxel(grid, 10, 2, 6, MATERIAL.WOOD);

  // A small water pool
  for (let x = 20; x <= 23; x++) {
    for (let z = 5; z <= 8; z++) {
      setVoxel(grid, x, 0, z, MATERIAL.WATER);
    }
  }

  return grid;
}

// Starting player position — middle of the larger room, on top of the floor.
export const STARTING_POSITION = { x: W / 2, y: 1, z: D / 2 + 6 };
