// Voxel grid -> Three.js InstancedMesh. Only renders voxels exposed to air.
// On grid change we rebuild the entire instance buffer; for a 32x6x32 grid
// this is well under a millisecond. Stage 1+ should chunk this when floors
// scale up.

import * as THREE from 'three';
import { getVoxel, isExposed, MATERIAL, indexOf } from '../sim/voxels.js';

const COLOR_BY_MATERIAL = {
  [MATERIAL.STONE]:  new THREE.Color('#7c7c84'),
  [MATERIAL.DIRT]:   new THREE.Color('#5a4128'),
  [MATERIAL.WOOD]:   new THREE.Color('#9c6d3a'),
  [MATERIAL.WATER]:  new THREE.Color('#3a6cd6'),
  [MATERIAL.LAVA]:   new THREE.Color('#e85a18'),
  [MATERIAL.ICE]:    new THREE.Color('#bfe8ff'),
};

const TINT_BY_HEIGHT = 0.04; // gentle vertical shading so cubes read as 3D
const tmpMatrix = new THREE.Matrix4();
const tmpColor = new THREE.Color();

export function buildVoxelMesh(grid) {
  const capacity = grid.width * grid.height * grid.depth;
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshLambertMaterial({ vertexColors: false });
  const mesh = new THREE.InstancedMesh(geometry, material, capacity);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
  mesh.frustumCulled = false; // floor is small and centered; skip culling cost
  mesh.count = 0;

  // instanceToVoxel[i] = {x,y,z} for the voxel at instance index i.
  // Used to translate raycaster hits back to voxel coordinates.
  const instanceToVoxel = new Array(capacity);
  const out = { object: mesh, instanceToVoxel };
  refreshVoxelMesh(out, grid);
  return out;
}

export function refreshVoxelMesh(meshHandle, grid) {
  const mesh = meshHandle.object;
  let i = 0;
  for (let z = 0; z < grid.depth; z++) {
    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        const m = grid.cells[indexOf(grid, x, y, z)];
        if (m === MATERIAL.AIR) continue;
        if (!isExposed(grid, x, y, z)) continue;
        const base = COLOR_BY_MATERIAL[m] || COLOR_BY_MATERIAL[MATERIAL.STONE];
        tmpColor.copy(base);
        // Slight darken at lower y so floor and walls read distinctly.
        const tint = 1 - (grid.height - 1 - y) * TINT_BY_HEIGHT;
        tmpColor.multiplyScalar(tint);
        // Centre voxels on the integer coord, with the bottom face at y=floor(y).
        tmpMatrix.makeTranslation(x + 0.5, y + 0.5, z + 0.5);
        mesh.setMatrixAt(i, tmpMatrix);
        mesh.setColorAt(i, tmpColor);
        meshHandle.instanceToVoxel[i] = { x, y, z };
        i++;
      }
    }
  }
  mesh.count = i;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}
