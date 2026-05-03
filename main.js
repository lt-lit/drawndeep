// Game loop. Wires the simulation, renderer, and input modules together.
// Owns the only mutable `state` reference in the project.

import { initialState, reducer, SIM } from './sim/state.js';
import { createScene } from './render/scene.js';
import { createDpad } from './ui/dpad.js';
import { bindTouchInput } from './input/touch.js';
import { bindDesktopInput } from './input/desktop.js';
import { inputState, drainPending } from './input/state.js';

const canvas = document.getElementById('game');
const uiRoot = document.getElementById('ui');

let state = initialState(/*seed=*/ 0xC0FFEE);

const sceneApi = createScene(canvas, state);
const dpad = createDpad(uiRoot);
bindTouchInput(canvas, dpad);
bindDesktopInput(canvas);

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
      } else if (ev.type === 'RegenFloor') {
        // Seed source is wall-clock since input is outside the sim. The
        // reducer treats it as opaque data and reseeds the floor PRNG.
        state = reducer(state, { type: 'RegenFloor', seed: Date.now() >>> 0 });
      }
    }
  }

  // Fixed-timestep simulation. Each Tick action carries the current input
  // intent, so the action stream is self-contained and replayable.
  while (accumulator >= SIM.TICK_DT_MS) {
    state = reducer(state, {
      type: 'Tick',
      intent: { x: inputState.intent.x, y: inputState.intent.y },
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
