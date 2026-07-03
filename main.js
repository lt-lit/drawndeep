// Game loop. Wires the simulation, renderer, and input modules together.
// Owns the only mutable `state` reference in the project.

import { initialState, reducer, SIM } from './sim/state.js';
import { createScene } from './render/scene.js';
import { createDpad } from './ui/dpad.js';
import { createRotateButtons } from './ui/rotate.js';
import { bindTouchInput } from './input/touch.js';
import { bindDesktopInput } from './input/desktop.js';
import { inputState, drainPending } from './input/state.js';

const canvas = document.getElementById('game');
const uiRoot = document.getElementById('ui');

let state = initialState(/*seed=*/ 0xC0FFEE);

const sceneApi = createScene(canvas, state);
const dpad = createDpad(uiRoot);
createRotateButtons(uiRoot);
bindTouchInput(canvas, dpad);
bindDesktopInput(canvas);

// Scratch vector for the screen→world intent mapping. Each Tick action
// gets its own fresh {x, y} payload so actions stay self-contained.
const worldIntent = { x: 0, y: 0 };

const hudFloor = document.getElementById('hud-floor');
const hudVoxels = document.getElementById('hud-voxels');
const hudFps = document.getElementById('hud-fps');

let lastTime = performance.now();
let accumulator = 0;
let fpsFrames = 0;
let fpsTime = 0;
let fps = 0;

function frame(now) {
  let frameTime = now - lastTime;
  if (frameTime > 250) frameTime = 250;     // clamp spiral-of-death
  lastTime = now;
  accumulator += frameTime;

  // Drain any one-shot input events (taps) and translate to actions.
  // Done once per frame, not per tick — taps are not deterministic anyway.
  const pending = drainPending();
  if (pending) {
    for (const ev of pending) {
      if (ev.type === 'TapAt') {
        const voxel = sceneApi.pickVoxel(ev.screenX, ev.screenY);
        if (voxel) {
          state = reducer(state, { type: 'DestroyVoxel', x: voxel.x, y: voxel.y, z: voxel.z });
        }
      } else if (ev.type === 'RotateCamera') {
        // Camera yaw is renderer state, not sim state — no reducer action.
        sceneApi.rotateCamera(ev.dir);
      }
    }
  }

  // Fixed-timestep simulation. Raw intent is screen-relative; it gets
  // rotated into world space by the camera's yaw *here*, so each Tick
  // action carries world-space intent and the action stream stays
  // self-contained and replayable without knowing camera state.
  while (accumulator >= SIM.TICK_DT_MS) {
    sceneApi.mapIntent(inputState.intent, worldIntent);
    state = reducer(state, {
      type: 'Tick',
      intent: { x: worldIntent.x, y: worldIntent.y },
    });
    accumulator -= SIM.TICK_DT_MS;
  }

  sceneApi.render(state);

  fpsFrames++;
  fpsTime += frameTime;
  if (fpsTime >= 500) {
    fps = Math.round((fpsFrames * 1000) / fpsTime);
    fpsFrames = 0;
    fpsTime = 0;
    hudFps.textContent = String(fps);
    hudFloor.textContent = String(state.floor);
    // Voxel HUD shows non-air count — cheap proxy for level density.
    let count = 0;
    const cells = state.grid.cells;
    for (let i = 0; i < cells.length; i++) if (cells[i] !== 0) count++;
    hudVoxels.textContent = String(count);
  }

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
