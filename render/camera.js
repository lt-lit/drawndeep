// Snap-rotate orbit camera. Yaw is locked to the four cardinal diagonals
// (45° + k·90°) so every room shows two walls; rotation tweens over
// ~250ms while movement input re-maps to the *target* yaw instantly.
// Also owns the camera-relative intent mapping and the occlusion-fade
// ray march, since both are functions of the camera pose.
//
// Wall-clock time is fine here — this is renderer-side state only. The
// sim never sees the yaw: main.js bakes it into world-space Tick intent.

import * as THREE from 'three';
import { getVoxel, isSolid, inBounds, chunkIndex } from '../sim/voxels.js';

// ~50° from horizontal per the design doc ("start at ~50°; tune on
// device") at the Stage-0 orbit distance. LOOK_AHEAD raises the focal
// point to chest height.
const TILT = THREE.MathUtils.degToRad(50);
const DISTANCE = 88;
const TWEEN_MS = 250;
const FOLLOW_LERP = 0.12;
const LOOK_AHEAD_Y = 5;
const QUARTER = Math.PI / 2;

// Ray-march sample heights (relative to the player's feet): shins,
// chest, head. Three rays so a wall hiding most of the body still
// triggers the fade even when one sample squeaks past an edge.
const OCCLUSION_SAMPLE_HEIGHTS = [1.5, 5.5, 9.5];

export function createCameraRig(camera) {
  // Yaw is the camera's azimuth around the player: offset direction is
  // (sin yaw, cos yaw) on the xz plane, so yaw 0 = camera due south of
  // the player looking north. Start on the SE diagonal.
  let targetYaw = Math.PI / 4;
  let tweenFromYaw = targetYaw;
  let tweenStartMs = -Infinity;

  const horizDist = Math.cos(TILT) * DISTANCE;
  const vertDist = Math.sin(TILT) * DISTANCE;

  const desiredPos = new THREE.Vector3();
  const desiredTarget = new THREE.Vector3();
  const lookTarget = new THREE.Vector3();
  let initialised = false;

  function yawAt(nowMs) {
    const t = (nowMs - tweenStartMs) / TWEEN_MS;
    if (t >= 1) return targetYaw;
    const s = t * t * (3 - 2 * t); // smoothstep
    return tweenFromYaw + (targetYaw - tweenFromYaw) * s;
  }

  // dir +1 = ⟳ (world appears to spin clockwise on screen), -1 = ⟲.
  // Retargeting mid-tween restarts the tween from the current angle, so
  // mashing the button stays smooth. targetYaw accumulates unbounded —
  // sin/cos don't care, and it keeps consecutive tweens direction-true.
  function rotate(dir) {
    const now = performance.now();
    tweenFromYaw = yawAt(now);
    tweenStartMs = now;
    targetYaw += dir * QUARTER;
  }

  function update(state, nowMs) {
    const yaw = yawAt(nowMs);
    const p = state.player;
    desiredPos.set(
      p.x + Math.sin(yaw) * horizDist,
      p.y + vertDist,
      p.z + Math.cos(yaw) * horizDist,
    );
    desiredTarget.set(p.x, p.y + LOOK_AHEAD_Y, p.z);
    if (!initialised) {
      camera.position.copy(desiredPos);
      lookTarget.copy(desiredTarget);
      initialised = true;
    } else {
      camera.position.lerp(desiredPos, FOLLOW_LERP);
      lookTarget.lerp(desiredTarget, FOLLOW_LERP);
    }
    camera.lookAt(lookTarget);
  }

  // Screen-space intent (x right, y down) → world-space xz intent,
  // using the *target* yaw so controls re-map the instant a rotation is
  // triggered rather than drifting through the tween.
  function mapIntent(intent, out) {
    const s = Math.sin(targetYaw);
    const c = Math.cos(targetYaw);
    out.x = intent.x * c + intent.y * s;
    out.y = -intent.x * s + intent.y * c;
    return out;
  }

  // Fill `outSet` with the indices of chunks holding solid voxels that
  // sit between the player and the camera. The caller swaps those
  // chunks to the faded material.
  function collectOccludedChunks(state, outSet) {
    outSet.clear();
    const p = state.player;
    for (let i = 0; i < OCCLUSION_SAMPLE_HEIGHTS.length; i++) {
      marchSolids(
        state.grid, state.chunks,
        p.x, p.y + OCCLUSION_SAMPLE_HEIGHTS[i], p.z,
        camera.position.x, camera.position.y, camera.position.z,
        outSet,
      );
    }
  }

  return { rotate, update, mapIntent, collectOccludedChunks };
}

// Amanatides–Woo voxel traversal from (x0,y0,z0) to (x1,y1,z1), adding
// the chunk index of every solid voxel crossed to `outSet`.
function marchSolids(grid, chunks, x0, y0, z0, x1, y1, z1, outSet) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const dz = z1 - z0;
  let vx = Math.floor(x0);
  let vy = Math.floor(y0);
  let vz = Math.floor(z0);
  const stepX = dx > 0 ? 1 : -1;
  const stepY = dy > 0 ? 1 : -1;
  const stepZ = dz > 0 ? 1 : -1;
  const tDeltaX = dx !== 0 ? Math.abs(1 / dx) : Infinity;
  const tDeltaY = dy !== 0 ? Math.abs(1 / dy) : Infinity;
  const tDeltaZ = dz !== 0 ? Math.abs(1 / dz) : Infinity;
  let tMaxX = dx !== 0 ? (stepX > 0 ? vx + 1 - x0 : x0 - vx) * tDeltaX : Infinity;
  let tMaxY = dy !== 0 ? (stepY > 0 ? vy + 1 - y0 : y0 - vy) * tDeltaY : Infinity;
  let tMaxZ = dz !== 0 ? (stepZ > 0 ? vz + 1 - z0 : z0 - vz) * tDeltaZ : Infinity;

  let t = 0;
  while (t <= 1) {
    if (inBounds(grid, vx, vy, vz)) {
      if (isSolid(getVoxel(grid, vx, vy, vz))) {
        const cs = chunks.size;
        outSet.add(chunkIndex(chunks, (vx / cs) | 0, (vy / cs) | 0, (vz / cs) | 0));
      }
    } else if (vy >= grid.height && dy > 0) {
      // Above the grid on the way up to the camera: nothing left to hit.
      break;
    }
    if (tMaxX < tMaxY && tMaxX < tMaxZ) {
      vx += stepX; t = tMaxX; tMaxX += tDeltaX;
    } else if (tMaxY < tMaxZ) {
      vy += stepY; t = tMaxY; tMaxY += tDeltaY;
    } else {
      vz += stepZ; t = tMaxZ; tMaxZ += tDeltaZ;
    }
  }
}
