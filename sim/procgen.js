// Procedural floor generation. Pure: takes a seed, returns a populated grid
// and a guaranteed-walkable spawn position.
//
// Stage 1 — caves only. Pipeline:
//   1. 2D occupancy map (W × D) randomly seeded at INITIAL_FILL solid.
//   2. CA_ITERATIONS_2D passes of B5/S4 cellular automata → blob caves.
//   3. Flood-fill from the largest open region; fill any disconnected
//      pockets so we don't waste mesh capacity on unreachable geometry.
//   4. Extrude the 2D map into a 3D wall volume (y = 1..WALL_TOP).
//   5. CA_ITERATIONS_3D passes of 3D Moore-neighbourhood CA over the wall
//      volume. Tops, edges, and inner corners get sculpted so walls read
//      as carved rock instead of extruded blocks.
//   6. Write the carved volume back to the voxel grid.
//
// Constraints that keep the 2D collision plan intact through the 3D pass:
//   - Walls (2D=solid) keep y=1..LOCKED_BOTTOM forced solid. This pins
//     the player-collision plane (which only checks y=1..10) to the 2D
//     footprint — walls never lose their footprint to CA erosion.
//   - Open columns (2D=open) keep y=1..PLAYER_CLEARANCE forced air. The
//     player is 10 voxels tall standing on y=0; PLAYER_CLEARANCE=10
//     guarantees no overhang ever drops into the body box.
//   - CA freely sculpts y=LOCKED_BOTTOM+1..WALL_TOP in walls and
//     y=PLAYER_CLEARANCE+1..WALL_TOP in open columns. The latter band
//     lets little eaves grow over caverns from adjacent wall masses.

import { createGrid, setVoxel, MATERIAL } from './voxels.js';
import { nextRandom } from './rng.js';

const WALL_TOP = 14;
const WALL_MIN_HEIGHT = 8;        // shortest a wall column can start (random init)
const LOCKED_BOTTOM = 2;
const PLAYER_CLEARANCE = 10;
const EDGE_PADDING = 1;

// 2D cave-shape CA.
const INITIAL_FILL = 0.45;
const CA_ITERATIONS_2D = 5;
const BIRTH_LIMIT_2D = 5;
const DEATH_LIMIT_2D = 4;

// 3D wall-sculpting CA. Out of 26 Moore neighbours. SURVIVE=14 erodes
// outer corners and tips while leaving wall interiors intact; BIRTH=16
// rarely fires but lets a small eave thicken when an air cell is mostly
// boxed in by rock above.
const CA_ITERATIONS_3D = 4;
const SURVIVE_THRESHOLD_3D = 13;
const BIRTH_THRESHOLD_3D = 15;

export function generateFloor(width, depth, height, seed) {
  const cave = generateCaveMap(width, depth, seed);
  cullDisconnectedRegions(cave.map, width, depth);

  const wall = build3DWallVolume(cave.map, width, depth, height, cave.seed);
  carve3D(wall, cave.map, width, depth, height);
  const map2d = cave.map;

  const grid = createGrid(width, height, depth);
  for (let z = 0; z < depth; z++) {
    for (let x = 0; x < width; x++) {
      setVoxel(grid, x, 0, z, MATERIAL.DIRT);
      for (let y = 1; y <= WALL_TOP; y++) {
        if (wall[index3D(x, y, z, width, height)]) {
          setVoxel(grid, x, y, z, MATERIAL.STONE);
        }
      }
    }
  }

  const spawn = findSpawn(map2d, width, depth);
  return { grid, spawn };
}

// ---------------------------------------------------------------------
// 2D cave-shape CA
// ---------------------------------------------------------------------

// Returns { map, seed }. Threading the seed lets the caller use freshly
// advanced state for the 3D pass without correlating its randomness with
// the 2D fill.
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

  for (let iter = 0; iter < CA_ITERATIONS_2D; iter++) {
    for (let z = 0; z < d; z++) {
      for (let x = 0; x < w; x++) {
        const i = x + z * w;
        if (isEdge(x, z, w, d)) {
          next[i] = 1;
          continue;
        }
        const n = solidNeighborCount2D(curr, x, z, w, d);
        if (curr[i] === 1) {
          next[i] = (n < DEATH_LIMIT_2D) ? 0 : 1;
        } else {
          next[i] = (n >= BIRTH_LIMIT_2D) ? 1 : 0;
        }
      }
    }
    const tmp = curr; curr = next; next = tmp;
  }

  return { map: curr, seed: s };
}

function isEdge(x, z, w, d) {
  return x < EDGE_PADDING || x >= w - EDGE_PADDING
      || z < EDGE_PADDING || z >= d - EDGE_PADDING;
}

function solidNeighborCount2D(map, x, z, w, d) {
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

// ---------------------------------------------------------------------
// 3D wall sculpting
// ---------------------------------------------------------------------

function index3D(x, y, z, w, h) {
  return x + w * (y + h * z);
}

// Initial wall volume. Each 2D-solid cell extrudes to a column whose top
// is randomised in [WALL_MIN_HEIGHT, WALL_TOP]. The randomness is what
// breaks the y-symmetry so the 3D CA produces actual y-variation: with a
// flat fully-extruded start, every middle layer would converge to the
// same shape and only the very top/bottom would erode.
function build3DWallVolume(map2d, w, d, h, seed) {
  const wall = new Uint8Array(w * h * d);
  let s = seed >>> 0;
  const range = WALL_TOP - WALL_MIN_HEIGHT + 1;
  for (let z = 0; z < d; z++) {
    for (let x = 0; x < w; x++) {
      if (map2d[x + z * w] === 1) {
        const r = nextRandom(s);
        s = r.seed;
        const top = WALL_MIN_HEIGHT + Math.floor(r.value * range);
        for (let y = 1; y <= top; y++) {
          wall[index3D(x, y, z, w, h)] = 1;
        }
      }
    }
  }
  return wall;
}

// 3D CA passes over the wall volume. Edits `wall` in place.
function carve3D(wall, map2d, w, d, h) {
  let curr = wall;
  let next = new Uint8Array(curr.length);

  for (let iter = 0; iter < CA_ITERATIONS_3D; iter++) {
    for (let z = 0; z < d; z++) {
      for (let x = 0; x < w; x++) {
        const m2d = map2d[x + z * w];
        const onEdge = isEdge(x, z, w, d);
        for (let y = 1; y <= WALL_TOP; y++) {
          const i = index3D(x, y, z, w, h);
          if (onEdge) { next[i] = 1; continue; }
          if (m2d === 1 && y <= LOCKED_BOTTOM) { next[i] = 1; continue; }
          if (m2d === 0 && y <= PLAYER_CLEARANCE) { next[i] = 0; continue; }

          const n = solidNeighborCount3D(curr, x, y, z, w, d, h);
          if (curr[i] === 1) {
            next[i] = (n >= SURVIVE_THRESHOLD_3D) ? 1 : 0;
          } else {
            next[i] = (n >= BIRTH_THRESHOLD_3D) ? 1 : 0;
          }
        }
      }
    }
    const tmp = curr; curr = next; next = tmp;
  }

  // After an odd number of swaps the final state lives in the scratch
  // buffer, not the original wall. Copy it back so the caller's reference
  // holds the final result.
  if (curr !== wall) wall.set(curr);
}

// 26-neighbour Moore count in the wall volume. Boundary handling matches
// the rest of the engine: out-of-bounds in X/Z is solid (perimeter wall);
// below y=1 is solid (the dirt floor anchors wall bases); above WALL_TOP
// is air (open ceiling).
function solidNeighborCount3D(wall, x, y, z, w, d, h) {
  let n = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0 && dz === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        const nz = z + dz;
        if (nx < 0 || nx >= w || nz < 0 || nz >= d) { n++; continue; }
        if (ny < 1) { n++; continue; }
        if (ny > WALL_TOP) continue;
        if (wall[index3D(nx, ny, nz, w, h)]) n++;
      }
    }
  }
  return n;
}

// ---------------------------------------------------------------------
// Spawn picking
// ---------------------------------------------------------------------

// Spawn = the open cell closest to the floor centre whose 3×3 neighbourhood
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
