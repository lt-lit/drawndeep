// Procedural floor generation. Pure: takes a seed, returns a populated grid
// and a guaranteed-walkable spawn position.
//
// Stage 1 — caves only. Pipeline:
//   1. 2D occupancy map (W × D) randomly seeded at INITIAL_FILL solid.
//   2. CA_ITERATIONS passes of B5/S4 cellular automata → blob caves.
//   3. Flood-fill from the largest open region; fill any disconnected
//      pockets so we don't waste mesh capacity on unreachable geometry.
//   4. Extrude the 2D map into voxels: dirt floor at y=0, stone wall
//      columns of WALL_TOP voxels above every solid cell.
//
// Ruin chambers, corridor carving, and chamber furniture come in a later
// pass when we add the ruins overlay.

import { createGrid, setVoxel, MATERIAL } from './voxels.js';
import { nextRandom } from './rng.js';

const WALL_TOP = 14;
const INITIAL_FILL = 0.45;        // probability a cell starts solid
const CA_ITERATIONS = 5;
const BIRTH_LIMIT = 5;            // dead → alive if solid neighbors ≥ this
const DEATH_LIMIT = 4;            // alive → dead if solid neighbors < this
const EDGE_PADDING = 1;           // cells this close to the boundary stay solid

export function generateFloor(width, depth, height, seed) {
  const map = generateCaveMap(width, depth, seed);
  cullDisconnectedRegions(map, width, depth);

  const grid = createGrid(width, height, depth);
  for (let z = 0; z < depth; z++) {
    for (let x = 0; x < width; x++) {
      setVoxel(grid, x, 0, z, MATERIAL.DIRT);  // floor everywhere
      if (map[x + z * width] === 1) {
        for (let y = 1; y <= WALL_TOP; y++) {
          setVoxel(grid, x, y, z, MATERIAL.STONE);
        }
      }
    }
  }

  const spawn = findSpawn(map, width, depth);
  return { grid, spawn };
}

// Random fill + CA passes. Outermost EDGE_PADDING ring stays forced-solid
// so the floor always has a closed perimeter.
function generateCaveMap(w, d, seed) {
  let s = seed >>> 0;
  let curr = new Uint8Array(w * d);
  let next = new Uint8Array(w * d);

  for (let z = 0; z < d; z++) {
    for (let x = 0; x < w; x++) {
      if (isEdge(x, z, w, d)) {
        curr[x + z * w] = 1;
      } else {
        const r = nextRandom(s);
        s = r.seed;
        curr[x + z * w] = r.value < INITIAL_FILL ? 1 : 0;
      }
    }
  }

  for (let iter = 0; iter < CA_ITERATIONS; iter++) {
    for (let z = 0; z < d; z++) {
      for (let x = 0; x < w; x++) {
        const i = x + z * w;
        if (isEdge(x, z, w, d)) {
          next[i] = 1;
          continue;
        }
        const n = solidNeighborCount(curr, x, z, w, d);
        if (curr[i] === 1) {
          next[i] = (n < DEATH_LIMIT) ? 0 : 1;
        } else {
          next[i] = (n >= BIRTH_LIMIT) ? 1 : 0;
        }
      }
    }
    const tmp = curr; curr = next; next = tmp;
  }

  return curr;
}

function isEdge(x, z, w, d) {
  return x < EDGE_PADDING || x >= w - EDGE_PADDING
      || z < EDGE_PADDING || z >= d - EDGE_PADDING;
}

// Moore neighborhood (8 cells). Out-of-bounds counts as solid so caves
// don't bloom open right at the boundary.
function solidNeighborCount(map, x, z, w, d) {
  let n = 0;
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dz === 0) continue;
      const nx = x + dx;
      const nz = z + dz;
      if (nx < 0 || nx >= w || nz < 0 || nz >= d || map[nx + nz * w] === 1) {
        n++;
      }
    }
  }
  return n;
}

// Find every connected open region (4-connected — same adjacency as
// player cardinal movement). Keep the largest, fill the rest with stone.
function cullDisconnectedRegions(map, w, d) {
  const visited = new Uint8Array(w * d);
  let bestRegion = null;
  let bestSize = 0;
  for (let z = 0; z < d; z++) {
    for (let x = 0; x < w; x++) {
      const i = x + z * w;
      if (map[i] === 0 && !visited[i]) {
        const region = floodFill(map, visited, x, z, w, d);
        if (region.length > bestSize) {
          bestSize = region.length;
          bestRegion = region;
        }
      }
    }
  }
  if (!bestRegion) return;
  const keep = new Uint8Array(w * d);
  for (let i = 0; i < bestRegion.length; i++) keep[bestRegion[i]] = 1;
  for (let i = 0; i < map.length; i++) {
    if (map[i] === 0 && !keep[i]) map[i] = 1;
  }
}

// Iterative BFS over open cells. Returns flat indices of region members.
function floodFill(map, visited, sx, sz, w, d) {
  const region = [];
  const queue = [sx + sz * w];
  visited[queue[0]] = 1;
  let head = 0;
  while (head < queue.length) {
    const i = queue[head++];
    region.push(i);
    const x = i % w;
    const z = (i / w) | 0;
    if (x + 1 < w) tryEnqueue(map, visited, queue, (x + 1) + z * w);
    if (x - 1 >= 0) tryEnqueue(map, visited, queue, (x - 1) + z * w);
    if (z + 1 < d) tryEnqueue(map, visited, queue, x + (z + 1) * w);
    if (z - 1 >= 0) tryEnqueue(map, visited, queue, x + (z - 1) * w);
  }
  return region;
}

function tryEnqueue(map, visited, queue, i) {
  if (map[i] === 0 && !visited[i]) {
    visited[i] = 1;
    queue.push(i);
  }
}

// Spawn = the open cell closest to the floor center whose 3×3 neighborhood
// is also open. The 3×3 check matches the player's 2-voxel-wide AABB
// (collidesAt in state.js samples floor(x±r) — three cells across).
function findSpawn(map, w, d) {
  const cx = w / 2;
  const cz = d / 2;
  let bestI = -1;
  let bestDist = Infinity;
  for (let z = 1; z < d - 1; z++) {
    for (let x = 1; x < w - 1; x++) {
      if (!is3x3Open(map, x, z, w)) continue;
      const dx = x + 0.5 - cx;
      const dz = z + 0.5 - cz;
      const dist = dx * dx + dz * dz;
      if (dist < bestDist) {
        bestDist = dist;
        bestI = x + z * w;
      }
    }
  }
  if (bestI < 0) {
    // Pathological cave with no 3×3 open pocket: fall back to any open cell.
    for (let i = 0; i < map.length; i++) {
      if (map[i] === 0) {
        return { x: (i % w) + 0.5, z: ((i / w) | 0) + 0.5 };
      }
    }
    return { x: w / 2, z: d / 2 };
  }
  const x = bestI % w;
  const z = (bestI / w) | 0;
  return { x: x + 0.5, z: z + 0.5 };
}

function is3x3Open(map, x, z, w) {
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (map[(x + dx) + (z + dz) * w] !== 0) return false;
    }
  }
  return true;
}
