// Three.js scene setup + per-frame render. Reads sim state, never mutates it.

import * as THREE from 'three';
import { buildVoxelMeshes, refreshDirtyChunks, voxelFromHit, setChunkFaded } from './voxel-mesh.js';
import { chunkCount } from '../sim/voxels.js';
import { createCharacter } from './characters.js';
import { createCameraRig } from './camera.js';

const FOV = 35;

// How long crumbled parts lie around before the debug auto-revive.
// Death has no sim-side trigger until Stage 7, so this keeps the X-key
// preview loop self-resetting.
const DEBUG_REVIVE_MS = 4200;

export function createScene(canvas, initialState, content) {
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

  // Voxel-part player character, defined by /data/characters/player.json
  // (loaded by main.js and passed in as plain data).
  const player = createCharacter(content.playerDef);
  scene.add(player.root);
  const prevPlayer = {
    x: initialState.player.x,
    z: initialState.player.z,
    dispY: initialState.player.y,
    ms: performance.now(),
  };
  let deathAtMs = 0;

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

    // Drive the character from observed sim movement: speed blends
    // idle↔walk, the movement direction sets facing. The renderer only
    // reads state — it never needs to know about input or actions.
    const now = performance.now();
    const dtSec = Math.max(1e-3, (now - prevPlayer.ms) / 1000);
    const dx = state.player.x - prevPlayer.x;
    const dz = state.player.z - prevPlayer.z;
    const speed = Math.hypot(dx, dz) / dtSec;
    // Step-ups snap ≤2 voxels in the sim; ease the character's visual y
    // over a few frames. Falls are already smooth (sim-side gravity).
    prevPlayer.dispY += (state.player.y - prevPlayer.dispY) * 0.45;
    if (Math.abs(state.player.y - prevPlayer.dispY) < 0.01) {
      prevPlayer.dispY = state.player.y;
    }
    player.update(now, {
      x: state.player.x,
      y: prevPlayer.dispY,
      z: state.player.z,
      speed,
      moveYaw: speed > 0.5 ? Math.atan2(dx, dz) : null,
    });
    prevPlayer.x = state.player.x;
    prevPlayer.z = state.player.z;
    prevPlayer.ms = now;
    if (deathAtMs && now - deathAtMs > DEBUG_REVIVE_MS) {
      player.revive();
      deathAtMs = 0;
    }

    // Camera follow + snap-rotate tween, then fade any chunks whose
    // solid voxels sit between the (post-move) camera and the player.
    cameraRig.update(state, now);
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

  // Debug clip trigger (C/H/X on desktop) until the sim emits real
  // combat events in Stage 7.
  function playClip(name) {
    if (name === 'death') {
      if (player.isDead()) return;
      deathAtMs = performance.now();
    }
    player.play(name);
  }

  return {
    render,
    pickVoxel,
    renderer,
    playClip,
    rotateCamera: cameraRig.rotate,
    mapIntent: cameraRig.mapIntent,
  };
}
