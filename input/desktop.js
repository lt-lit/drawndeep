// Keyboard + mouse for desktop testing. WASD/arrows move; click destroys.

import { inputState, pushPending } from './state.js';

export function bindDesktopInput(canvas) {
  const pressed = new Set();

  function updateIntent() {
    let x = 0;
    let y = 0;
    if (pressed.has('w') || pressed.has('arrowup'))    y -= 1;
    if (pressed.has('s') || pressed.has('arrowdown'))  y += 1;
    if (pressed.has('a') || pressed.has('arrowleft'))  x -= 1;
    if (pressed.has('d') || pressed.has('arrowright')) x += 1;
    if (x !== 0 && y !== 0) {
      const inv = 1 / Math.SQRT2;
      x *= inv;
      y *= inv;
    }
    inputState.intent.x = x;
    inputState.intent.y = y;
  }

  window.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    // Q/E snap-rotate the camera. One step per press — ignore key repeat.
    if (!e.repeat && (key === 'q' || key === 'e')) {
      pushPending({ type: 'RotateCamera', dir: key === 'e' ? 1 : -1 });
    }
    // Debug clip previews until the sim emits real combat events
    // (Stage 7): C cast, H hit, X death-crumble (auto-revives).
    if (!e.repeat && (key === 'c' || key === 'h' || key === 'x')) {
      pushPending({
        type: 'DebugClip',
        clip: key === 'c' ? 'cast' : key === 'h' ? 'hit' : 'death',
      });
    }
    pressed.add(key);
    updateIntent();
  });
  window.addEventListener('keyup', (e) => {
    pressed.delete(e.key.toLowerCase());
    updateIntent();
  });

  // Mouse click on the canvas — but only register if the device isn't
  // primarily touch (we route touch through input/touch.js).
  canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    if (window.matchMedia('(pointer: coarse)').matches) return;
    pushPending({ type: 'TapAt', screenX: e.clientX, screenY: e.clientY });
  });
}
