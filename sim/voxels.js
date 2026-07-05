// Voxel grid. Materials are stored as Uint8 IDs in a flat TypedArray
// for cache-friendliness. The grid object is treated as owned by the
// reducer — callers don't keep references after dispatching actions.

export const MATERIAL = {
  AIR: 0,
  STONE: 1,
  DIRT: 2,
  WOOD: 3,
  WATER: 4,
  LAVA: 5,
  ICE: 6,
};

export const MATERIAL_NAME = Object.fromEntries(
  Object.entries(MATERIAL).map(([k, v]) => [v, k.toLowerCase()]),
);

// Whether a material blocks movement / line of sight at the voxel level.
export function isSolid(materialId) {
  return materialId === MATERIAL.STONE
    || materialId === MATERIAL.DIRT
    || materialId === MATERIAL.WOOD
    || materialId === MATERIAL.ICE;
}

export function createGrid(width, height, depth) {
  return {
    width,
    height,
    depth,
    cells: new Uint8Array(width * height * depth),
  };
}

export function inBounds(grid, x, y, z) {
  return x >= 0 && x < grid.width
    && y >= 0 && y < grid.height
    && z >= 0 && z < grid.depth;
}

export function indexOf(grid, x, y, z) {
  return x + grid.width * (y + grid.height * z);
}

export function getVoxel(grid, x, y, z) {
  if (!inBounds(grid, x, y, z)) {
    // Out of bounds reads: open sky above, bedrock below (so walkable
    // support scans always terminate), solid stone beyond X/Z (world
    // is bounded by rock).
    if (y >= grid.height) return MATERIAL.AIR;
    return MATERIAL.STONE;
  }
  return grid.cells[indexOf(grid, x, y, z)];
}

export function setVoxel(grid, x, y, z, materialId) {
  if (!inBounds(grid, x, y, z)) return grid;
  grid.cells[indexOf(grid, x, y, z)] = materialId;
  return grid;
}

// True if voxel at (x,y,z) is non-air and has at least one air neighbor.
// Used by the mesher to skip occluded voxels.
export function isExposed(grid, x, y, z) {
  if (getVoxel(grid, x, y, z) === MATERIAL.AIR) return false;
  return getVoxel(grid, x + 1, y, z) === MATERIAL.AIR
    || getVoxel(grid, x - 1, y, z) === MATERIAL.AIR
    || getVoxel(grid, x, y + 1, z) === MATERIAL.AIR
    || getVoxel(grid, x, y - 1, z) === MATERIAL.AIR
    || getVoxel(grid, x, y, z + 1) === MATERIAL.AIR
    || getVoxel(grid, x, y, z - 1) === MATERIAL.AIR;
}

// ---------------------------------------------------------------------
// Chunks. Each chunk is a CHUNK_SIZE^3 region of the grid. The renderer
// builds one InstancedMesh per chunk and rebuilds only chunks whose
// revision counter changed since the last frame. Chunks live in /sim
// because the reducer needs to bump their revisions on voxel mutation.
// ---------------------------------------------------------------------

export const CHUNK_SIZE = 16;

export function createChunks(width, height, depth) {
  const nx = Math.ceil(width / CHUNK_SIZE);
  const ny = Math.ceil(height / CHUNK_SIZE);
  const nz = Math.ceil(depth / CHUNK_SIZE);
  return {
    size: CHUNK_SIZE,
    nx, ny, nz,
    revisions: new Uint32Array(nx * ny * nz),
  };
}

export function chunkCount(chunks) {
  return chunks.nx * chunks.ny * chunks.nz;
}

export function chunkIndex(chunks, cx, cy, cz) {
  return cx + chunks.nx * (cy + chunks.ny * cz);
}

// Bump the chunk containing (x,y,z) and any chunk-neighbors across a
// chunk face — those chunks' edge voxels may have gained or lost an
// "exposed" face when (x,y,z) changed.
export function bumpAffectedChunks(chunks, x, y, z) {
  const cs = chunks.size;
  const ownX = (x / cs) | 0;
  const ownY = (y / cs) | 0;
  const ownZ = (z / cs) | 0;

  bumpChunkAt(chunks, ownX, ownY, ownZ);

  if (x % cs === 0)        bumpChunkAt(chunks, ownX - 1, ownY, ownZ);
  if (x % cs === cs - 1)   bumpChunkAt(chunks, ownX + 1, ownY, ownZ);
  if (y % cs === 0)        bumpChunkAt(chunks, ownX, ownY - 1, ownZ);
  if (y % cs === cs - 1)   bumpChunkAt(chunks, ownX, ownY + 1, ownZ);
  if (z % cs === 0)        bumpChunkAt(chunks, ownX, ownY, ownZ - 1);
  if (z % cs === cs - 1)   bumpChunkAt(chunks, ownX, ownY, ownZ + 1);
}

function bumpChunkAt(chunks, cx, cy, cz) {
  if (cx < 0 || cx >= chunks.nx) return;
  if (cy < 0 || cy >= chunks.ny) return;
  if (cz < 0 || cz >= chunks.nz) return;
  chunks.revisions[chunkIndex(chunks, cx, cy, cz)]++;
}
