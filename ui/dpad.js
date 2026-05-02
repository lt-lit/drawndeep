// Floating virtual d-pad. The base appears wherever the user's first touch
// lands in the d-pad zone; the stick tracks the current finger position.
// On release everything hides. Magnitude scales movement speed (analog).

import { inputState } from '../input/state.js';

const DEAD_ZONE_PX = 8;
const MAX_RADIUS_PX = 60;

export function createDpad(rootEl) {
  const base = document.createElement('div');
  base.className = 'dpad-base';
  base.style.display = 'none';
  rootEl.appendChild(base);

  const stick = document.createElement('div');
  stick.className = 'dpad-stick';
  stick.style.display = 'none';
  rootEl.appendChild(stick);

  let originX = 0;
  let originY = 0;
  let active = false;

  function show(x, y) {
    originX = x;
    originY = y;
    base.style.left = x + 'px';
    base.style.top = y + 'px';
    base.style.display = 'block';
    stick.style.left = x + 'px';
    stick.style.top = y + 'px';
    stick.style.display = 'block';
    active = true;
  }

  function move(x, y) {
    if (!active) return;
    let dx = x - originX;
    let dy = y - originY;
    const dist = Math.hypot(dx, dy);
    if (dist > MAX_RADIUS_PX) {
      dx = (dx / dist) * MAX_RADIUS_PX;
      dy = (dy / dist) * MAX_RADIUS_PX;
    }
    stick.style.left = (originX + dx) + 'px';
    stick.style.top = (originY + dy) + 'px';
    if (dist < DEAD_ZONE_PX) {
      inputState.intent.x = 0;
      inputState.intent.y = 0;
    } else {
      // Magnitude is encoded in the vector length (capped at 1) so the
      // sim can read analog speed from |intent|.
      inputState.intent.x = dx / MAX_RADIUS_PX;
      inputState.intent.y = dy / MAX_RADIUS_PX;
    }
  }

  function hide() {
    base.style.display = 'none';
    stick.style.display = 'none';
    active = false;
    inputState.intent.x = 0;
    inputState.intent.y = 0;
  }

  return { show, move, hide, isActive: () => active };
}
