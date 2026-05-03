// Three.js scene setup + per-frame render. Reads sim state, never mutates it.

import * as THREE from 'three';
import { buildVoxelMesh, refreshVoxelMesh } from './voxel-mesh.js';
import { createPlayerSprite } from './sprites.js';

// ~45° from vertical, pulled back enough to frame a 10-voxel-tall character
// against 12-voxel walls. Scale together if you change the player size.
const CAMERA_OFFSET = new THREE.Vector3(0, 44, 44);
const CAMERA_LOOK_AHEAD = new THREE.Vector3(0, 5, 0);
const CAMERA_LERP = 0.12;
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
  scene.fog = new THREE.Fog(0x0a0a0f, 50, 130);

  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 200);
  const cameraTarget = new THREE.Vector3();
  const cameraDesiredPos = new THREE.Vector3();
  const cameraDesiredTarget = new THREE.Vector3();

  // Lighting: cheap and stylised. No shadows.
  const ambient = new THREE.AmbientLight(0xffffff, 0.55);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(0xffe8c0, 0.85);
  sun.position.set(-6, 14, 8);
  scene.add(sun);

  const fill = new THREE.DirectionalLight(0x6688ff, 0.25);
  fill.position.set(8, 6, -10);
  scene.add(fill);

  // Voxel mesh + lookup from instance index back to voxel coords for picking.
  const voxelMesh = buildVoxelMesh(initialState.grid);
  scene.add(voxelMesh.object);

  // Player sprite (billboarded).
  const playerSprite = createPlayerSprite();
  scene.add(playerSprite);

  let lastVoxelRevision = initialState.voxelRevision;
  let cameraInitialised = false;

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
    // Rebuild voxel mesh if the grid changed.
    if (state.voxelRevision !== lastVoxelRevision) {
      refreshVoxelMesh(voxelMesh, state.grid);
      lastVoxelRevision = state.voxelRevision;
    }

    // Player sprite tracks player position; sprite is anchored at its bottom.
    playerSprite.position.set(state.player.x, state.player.y, state.player.z);

    // Camera follow.
    cameraDesiredPos.set(
      state.player.x + CAMERA_OFFSET.x,
      state.player.y + CAMERA_OFFSET.y,
      state.player.z + CAMERA_OFFSET.z,
    );
    cameraDesiredTarget
      .set(state.player.x, state.player.y, state.player.z)
      .add(CAMERA_LOOK_AHEAD);
    if (!cameraInitialised) {
      camera.position.copy(cameraDesiredPos);
      cameraTarget.copy(cameraDesiredTarget);
      cameraInitialised = true;
    } else {
      camera.position.lerp(cameraDesiredPos, CAMERA_LERP);
      cameraTarget.lerp(cameraDesiredTarget, CAMERA_LERP);
    }
    camera.lookAt(cameraTarget);

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
    const hits = raycaster.intersectObject(voxelMesh.object, false);
    if (hits.length === 0) return null;
    const hit = hits[0];
    const voxel = voxelMesh.instanceToVoxel[hit.instanceId];
    return voxel || null;
  }

  return { render, pickVoxel, renderer };
}
