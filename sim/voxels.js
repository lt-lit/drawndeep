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
    // Out of bounds in X/Z reads as solid stone (world is bounded by walls);
    // out of bounds in Y reads as air (open above, void below).
    if (y < 0 || y >= grid.height) return MATERIAL.AIR;
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
