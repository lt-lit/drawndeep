// Three.js scene setup + per-frame render. Reads sim state, never mutates it.

import * as THREE from 'three';
import { buildVoxelMeshes, refreshDirtyChunks, voxelFromHit, setChunkFaded } from './voxel-mesh.js';
import { chunkCount } from '../sim/voxels.js';
import { createPlayerSprite } from './sprites.js';
import { createCameraRig } from './camera.js';

const FOV = 35;

export function createScene(canvas, initialState) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: window.devicePixelRatio < 2,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x0a0a0f, 1);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x0a0a0f, 60, 160);

  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 200);
  const cameraRig = createCameraRig(camera);
  const occludedChunks = new Set();

  // Lighting: cheap and stylised. No shadows.
  const ambient = new THREE.AmbientLight(0xffffff, 0.55);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(0xffe8c0, 0.85);
  sun.position.set(-6, 14, 8);
  scene.add(sun);

  const fill = new THREE.DirectionalLight(0x6688ff, 0.25);
  fill.position.set(8, 6, -10);
  scene.add(fill);

  // One InstancedMesh per chunk; only chunks whose revision changed get
  // rebuilt. lastChunkRevisions mirrors state.chunks.revisions one frame
  // behind so we know which chunks the sim has dirtied.
  const voxelWorld = buildVoxelMeshes(initialState.grid, initialState.chunks);
  scene.add(voxelWorld.group);
  const lastChunkRevisions = new Uint32Array(chunkCount(initialState.chunks));
  lastChunkRevisions.set(initialState.chunks.revisions);

  // Player sprite (billboarded). Retired in Stage 1b for the voxel-part
  // character; billboards at least stay legible under snap-rotation.
  const playerSprite = createPlayerSprite();
  scene.add(playerSprite);

  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener('resize', resize);

  function render(state) {
    // Rebuild only the chunks whose revision counter changed.
    refreshDirtyChunks(voxelWorld.handles, state.grid, state.chunks, lastChunkRevisions);

    // Player sprite tracks player position; sprite is anchored at its bottom.
    playerSprite.position.set(state.player.x, state.player.y, state.player.z);

    // Camera follow + snap-rotate tween, then fade any chunks whose
    // solid voxels sit between the (post-move) camera and the player.
    cameraRig.update(state, performance.now());
    cameraRig.collectOccludedChunks(state, occludedChunks);
    const handles = voxelWorld.handles;
    for (let i = 0; i < handles.length; i++) {
      setChunkFaded(handles[i], occludedChunks.has(i));
    }

    renderer.render(scene, camera);
  }

  // Convert a screen-space point (CSS pixels) to a voxel coord under the cursor,
  // or null if no voxel is under it. Used by main.js to translate tap events
  // into DestroyVoxel actions.
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  function pickVoxel(screenX, screenY) {
    const rect = canvas.getBoundingClientRect();
    ndc.x = ((screenX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((screenY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(voxelWorld.group.children, false);
    if (hits.length === 0) return null;
    return voxelFromHit(hits[0]);
  }

  return {
    render,
    pickVoxel,
    renderer,
    rotateCamera: cameraRig.rotate,
    mapIntent: cameraRig.mapIntent,
  };
}
