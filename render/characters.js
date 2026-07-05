// Voxel-part characters: rigid box parts in a parent hierarchy, defined
// entirely by JSON (/data/characters/*.json), animated by one shared
// procedural clip set. Characters differ by data, never by bespoke
// animation code.
//
// Transform semantics (the contract character JSON is authored against):
//   - a part is one box, centred on its own origin
//   - `offset` positions that origin relative to the parent part's
//     origin (or the character's feet for parentless parts)
//   - `pivot` is the rotation point relative to the part's origin
// Rendering is one InstancedMesh per character — whole character is a
// single draw call; per frame we compose local transforms down the
// hierarchy and write instance matrices.
//
// deathStyle "crumble" detaches the parts as short-lived cannon-es
// rigid bodies. The physics is a renderer-side cosmetic effect only —
// the sim never sees it, so Math.random here is fine (the seeded-RNG
// rule protects /sim, not effects).

import * as THREE from 'three';
import * as CANNON from 'cannon-es';

const DEG = Math.PI / 180;
const TWO_PI = Math.PI * 2;

// Matches sim PLAYER_SPEED * TICKS_PER_SECOND (0.30 * 60). Only used to
// normalise the idle↔walk blend — a mismatch just means the walk clip
// saturates a little early or late.
const FULL_SPEED = 18;

const WALK_HZ = 2.3;      // stride cycles/sec at full speed
const IDLE_BOB = 0.09;    // voxels of idle breathing bob
const TURN_LERP = 0.22;   // facing smoothing per frame
const CAST_MS = 380;
const HIT_MS = 260;
const CRUMBLE_GRAVITY = -30;

const sharedGeometry = new THREE.BoxGeometry(1, 1, 1);

export function createCharacter(def) {
  // Parents-first order so world matrices can be composed in one pass.
  const ordered = sortParentsFirst(def.parts);
  const indexByName = new Map(ordered.map((p, i) => [p.name, i]));
  const parts = ordered.map((p) => ({
    size: p.size,
    offset: p.offset,
    pivot: p.pivot || [0, 0, 0],
    parent: p.parent != null ? indexByName.get(p.parent) : -1,
  }));
  const anim = def.anim || {};

  const material = new THREE.MeshLambertMaterial();
  const mesh = new THREE.InstancedMesh(sharedGeometry, material, parts.length);
  mesh.frustumCulled = false; // matrices move every frame; default bounds are wrong anyway
  {
    const c = new THREE.Color();
    for (let i = 0; i < parts.length; i++) {
      mesh.setColorAt(i, c.set((def.palette || {})[ordered[i].color] || '#ffffff'));
    }
    mesh.instanceColor.needsUpdate = true;
  }

  // root carries world position + facing yaw; body carries clip-driven
  // bob/lunge/squash so squash-and-stretch scales the whole hierarchy
  // from the feet.
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.add(mesh);
  root.add(body);

  // --- animation state ---
  let mode = 'live'; // 'live' | 'ragdoll'
  let lastMs = -1;
  let walkPhase = 0;
  let yaw = 0;
  let oneShot = null; // { clip: 'cast'|'hit', startMs }
  let physics = null; // { world, bodies } while crumbling

  // Per-part pose scratch, preallocated.
  const rotations = parts.map(() => new THREE.Euler());
  const worldMats = parts.map(() => new THREE.Matrix4());
  const mLocal = new THREE.Matrix4();
  const mTmp = new THREE.Matrix4();

  function setRotX(name, radians) {
    const i = indexByName.get(name);
    if (i != null) rotations[i].x = radians;
  }
  function addRotX(name, radians) {
    const i = indexByName.get(name);
    if (i != null) rotations[i].x += radians;
  }

  // target: { x, y, z, speed (voxels/sec), moveYaw (radians|null) }
  function update(nowMs, target) {
    const dt = lastMs < 0 ? 1 / 60 : Math.min(0.1, (nowMs - lastMs) / 1000);
    lastMs = nowMs;
    if (mode === 'ragdoll') {
      stepRagdoll(dt);
      return;
    }

    root.position.set(target.x, target.y, target.z);
    const speed01 = Math.min(1, (target.speed || 0) / FULL_SPEED);
    if (speed01 > 0.05 && target.moveYaw != null) {
      yaw = lerpAngle(yaw, target.moveYaw, TURN_LERP);
    }
    root.rotation.y = yaw;

    // Zero the pose, then layer locomotion + any one-shot on top.
    for (let i = 0; i < rotations.length; i++) rotations[i].set(0, 0, 0);
    body.position.set(0, 0, 0);
    body.scale.set(1, 1, 1);

    const t = nowMs / 1000;
    walkPhase += speed01 * WALK_HZ * TWO_PI * dt;

    // Locomotion: walk swings scale with speed, idle sway/bob fades out
    // as speed comes in.
    const swing = Math.sin(walkPhase);
    const legAmp = (anim.legSwingDeg || 30) * DEG * speed01;
    const armAmp = (anim.armSwingDeg || 25) * DEG * speed01;
    setRotX('legL', swing * legAmp);
    setRotX('legR', -swing * legAmp);
    setRotX('armL', -swing * armAmp);
    setRotX('armR', swing * armAmp);

    const idle01 = 1 - speed01;
    const bobHz = anim.idleBobHz || 0.7;
    const idleBob = Math.sin(t * bobHz * TWO_PI) * IDLE_BOB;
    const walkBob = Math.abs(Math.sin(walkPhase)) * (anim.walkBob || 0.2);
    body.position.y = idle01 * idleBob + speed01 * walkBob;
    const swayIdx = indexByName.get('torso');
    if (swayIdx != null) {
      rotations[swayIdx].z = Math.sin(t * bobHz * Math.PI) * (anim.idleSway || 0.05) * idle01;
    }

    if (oneShot) {
      const ms = oneShot.clip === 'cast' ? CAST_MS : HIT_MS;
      const p = (nowMs - oneShot.startMs) / ms;
      if (p >= 1) {
        oneShot = null;
      } else if (oneShot.clip === 'cast') {
        const env = Math.sin(p * Math.PI);
        addRotX(anim.castArm || 'armR', -125 * DEG * env); // arm whips forward-up
        addRotX('torso', 8 * DEG * env);                   // slight lean into it
        body.position.z += (anim.castLunge || 0.3) * 2.2 * env;
      } else {
        const env = Math.sin(p * Math.PI);
        const r = anim.hitRecoil || 0.3;
        body.scale.y = 1 - 0.5 * r * env;                  // squash…
        body.scale.x = body.scale.z = 1 + 0.3 * r * env;   // …and stretch
        body.position.z -= 0.9 * env;                      // knocked back
      }
    }

    composeMatrices();
  }

  function composeMatrices() {
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      // local = T(offset+pivot) · R · T(-pivot): rotate about the pivot,
      // sit at offset in the parent's space.
      mLocal.makeTranslation(
        p.offset[0] + p.pivot[0],
        p.offset[1] + p.pivot[1],
        p.offset[2] + p.pivot[2],
      );
      mTmp.makeRotationFromEuler(rotations[i]);
      mLocal.multiply(mTmp);
      mLocal.multiply(mTmp.makeTranslation(-p.pivot[0], -p.pivot[1], -p.pivot[2]));
      if (p.parent >= 0) {
        worldMats[i].multiplyMatrices(worldMats[p.parent], mLocal);
      } else {
        worldMats[i].copy(mLocal);
      }
      mTmp.makeScale(p.size[0], p.size[1], p.size[2]);
      mTmp.premultiply(worldMats[i]);
      mesh.setMatrixAt(i, mTmp);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  // --- death crumble ---

  const dPos = new THREE.Vector3();
  const dQuat = new THREE.Quaternion();
  const dScale = new THREE.Vector3();

  function startCrumble() {
    if (mode === 'ragdoll') return;
    mode = 'ragdoll';

    // Capture each part's world pose before flattening the transform
    // chain: during ragdoll, instance matrices are written in world
    // space, so root/body must become identity.
    root.updateMatrixWorld(true);
    const meshWorld = mesh.matrixWorld.clone();
    const groundY = root.position.y;
    root.position.set(0, 0, 0);
    root.rotation.y = 0;
    body.position.set(0, 0, 0);
    body.scale.set(1, 1, 1);

    const world = new CANNON.World({ gravity: new CANNON.Vec3(0, CRUMBLE_GRAVITY, 0) });
    const ground = new CANNON.Body({ type: CANNON.Body.STATIC, shape: new CANNON.Plane() });
    ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    ground.position.y = groundY;
    world.addBody(ground);

    const bodies = [];
    for (let i = 0; i < parts.length; i++) {
      const size = parts[i].size;
      mTmp.multiplyMatrices(meshWorld, worldMats[i]);
      mTmp.decompose(dPos, dQuat, dScale);
      const b = new CANNON.Body({
        mass: size[0] * size[1] * size[2] * 0.2,
        shape: new CANNON.Box(new CANNON.Vec3(size[0] / 2, size[1] / 2, size[2] / 2)),
        position: new CANNON.Vec3(dPos.x, dPos.y, dPos.z),
        quaternion: new CANNON.Quaternion(dQuat.x, dQuat.y, dQuat.z, dQuat.w),
      });
      b.velocity.set((Math.random() - 0.5) * 8, 4 + Math.random() * 6, (Math.random() - 0.5) * 8);
      b.angularVelocity.set(
        (Math.random() - 0.5) * 10,
        (Math.random() - 0.5) * 10,
        (Math.random() - 0.5) * 10,
      );
      world.addBody(b);
      bodies.push(b);
    }
    physics = { world, bodies };
  }

  function stepRagdoll(dt) {
    physics.world.step(1 / 60, dt, 3);
    for (let i = 0; i < parts.length; i++) {
      const b = physics.bodies[i];
      dPos.set(b.position.x, b.position.y, b.position.z);
      dQuat.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
      dScale.set(parts[i].size[0], parts[i].size[1], parts[i].size[2]);
      mTmp.compose(dPos, dQuat, dScale);
      mesh.setMatrixAt(i, mTmp);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  function revive() {
    physics = null;
    mode = 'live';
    oneShot = null;
  }

  // Standard clip set. idle/walk are automatic (blended from movement
  // speed); cast and hit are one-shots; death starts the crumble.
  function play(name) {
    if (mode === 'ragdoll') return;
    if (name === 'cast' || name === 'hit') {
      oneShot = { clip: name, startMs: performance.now() };
    } else if (name === 'death') {
      startCrumble();
    }
  }

  function dispose() {
    mesh.dispose();
    material.dispose();
  }

  return { root, update, play, revive, dispose, isDead: () => mode === 'ragdoll' };
}

function sortParentsFirst(parts) {
  const byName = new Map(parts.map((p) => [p.name, p]));
  const depthOf = (p) => (p.parent ? depthOf(byName.get(p.parent)) + 1 : 0);
  return [...parts].sort((a, b) => depthOf(a) - depthOf(b));
}

function lerpAngle(a, b, k) {
  let d = (b - a) % TWO_PI;
  if (d > Math.PI) d -= TWO_PI;
  if (d < -Math.PI) d += TWO_PI;
  return a + d * k;
}
