// Voxel grid -> Three.js chunked InstancedMeshes.
//
// One InstancedMesh per CHUNK_SIZE^3 region. Each chunk's mesh is
// rebuilt only when its revision counter (in sim/voxels.js chunks)
// changes, so a single voxel destruction touches 1-7 chunks instead
// of the whole world.
//
// Frustum culling is left off: the chunk InstancedMesh has the wrong
// default bounds (a unit cube at origin), so Three would cull
// incorrectly. For the floor sizes we care about right now the cost
// of "draw every chunk" is negligible. Add proper bounds + culling
// when floor size goes past ~256 voxels per side.

import * as THREE from 'three';
import {
  isExposed, MATERIAL, indexOf, chunkCount, chunkIndex, CHUNK_SIZE,
} from '../sim/voxels.js';

const COLOR_BY_MATERIAL = {
  [MATERIAL.STONE]: new THREE.Color('#7c7c84'),
  [MATERIAL.DIRT]:  new THREE.Color('#5a4128'),
  [MATERIAL.WOOD]:  new THREE.Color('#9c6d3a'),
  [MATERIAL.WATER]: new THREE.Color('#3a6cd6'),
  [MATERIAL.LAVA]:  new THREE.Color('#e85a18'),
  [MATERIAL.ICE]:   new THREE.Color('#bfe8ff'),
};

const TINT_BY_HEIGHT = 0.04;
const tmpMatrix = new THREE.Matrix4();
const tmpColor = new THREE.Color();

// Shared geometry + material across all chunks.
const sharedGeometry = new THREE.BoxGeometry(1, 1, 1);
const sharedMaterial = new THREE.MeshLambertMaterial();

export function buildVoxelMeshes(grid, chunks) {
  const total = chunkCount(chunks);
  const handles = new Array(total);
  const group = new THREE.Group();

  for (let cz = 0; cz < chunks.nz; cz++) {
    for (let cy = 0; cy < chunks.ny; cy++) {
      for (let cx = 0; cx < chunks.nx; cx++) {
        const handle = createChunkHandle(chunks, cx, cy, cz);
        handles[chunkIndex(chunks, cx, cy, cz)] = handle;
        group.add(handle.object);
        refreshChunk(handle, grid, chunks, cx, cy, cz);
      }
    }
  }

  return { group, handles };
}

function createChunkHandle(chunks, cx, cy, cz) {
  const cs = chunks.size;
  const capacity = cs * cs * cs;
  const mesh = new THREE.InstancedMesh(sharedGeometry, sharedMaterial, capacity);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(
    new Float32Array(capacity * 3), 3,
  );
  mesh.frustumCulled = false;
  mesh.count = 0;
  // Chunk meshes carry world coords directly in their instance matrices,
  // so position stays at origin. (Switching to chunk-local matrices is
  // the right move once we add per-chunk frustum culling.)

  // 16-bit packed local coords: (zl<<8)|(yl<<4)|xl. Decode on raycast hit.
  const instanceLocal = new Uint16Array(capacity);

  const handle = { object: mesh, instanceLocal, cx, cy, cz };
  mesh.userData.chunkHandle = handle;
  return handle;
}

export function refreshDirtyChunks(handles, grid, chunks, lastRevisions) {
  const total = chunkCount(chunks);
  for (let i = 0; i < total; i++) {
    if (chunks.revisions[i] !== lastRevisions[i]) {
      const handle = handles[i];
      refreshChunk(handle, grid, chunks, handle.cx, handle.cy, handle.cz);
      lastRevisions[i] = chunks.revisions[i];
    }
  }
}

function refreshChunk(handle, grid, chunks, cx, cy, cz) {
  const cs = chunks.size;
  const x0 = cx * cs;
  const y0 = cy * cs;
  const z0 = cz * cs;
  const x1 = Math.min(x0 + cs, grid.width);
  const y1 = Math.min(y0 + cs, grid.height);
  const z1 = Math.min(z0 + cs, grid.depth);

  const mesh = handle.object;
  let i = 0;
  for (let z = z0; z < z1; z++) {
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const m = grid.cells[indexOf(grid, x, y, z)];
        if (m === MATERIAL.AIR) continue;
        if (!isExposed(grid, x, y, z)) continue;
        const base = COLOR_BY_MATERIAL[m] || COLOR_BY_MATERIAL[MATERIAL.STONE];
        tmpColor.copy(base);
        const tint = 1 - (grid.height - 1 - y) * TINT_BY_HEIGHT;
        tmpColor.multiplyScalar(tint);
        tmpMatrix.makeTranslation(x + 0.5, y + 0.5, z + 0.5);
        mesh.setMatrixAt(i, tmpMatrix);
        mesh.setColorAt(i, tmpColor);
        handle.instanceLocal[i] = (x - x0) | ((y - y0) << 4) | ((z - z0) << 8);
        i++;
      }
    }
  }
  mesh.count = i;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}

// Resolve a raycast hit on a chunk mesh back to world voxel coordinates.
export function voxelFromHit(hit) {
  const handle = hit.object && hit.object.userData && hit.object.userData.chunkHandle;
  if (!handle) return null;
  const packed = handle.instanceLocal[hit.instanceId];
  const xl = packed & 0xF;
  const yl = (packed >> 4) & 0xF;
  const zl = (packed >> 8) & 0xF;
  return {
    x: handle.cx * CHUNK_SIZE + xl,
    y: handle.cy * CHUNK_SIZE + yl,
    z: handle.cz * CHUNK_SIZE + zl,
  };
}
