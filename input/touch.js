// Touch / pointer input. The screen splits into a d-pad zone (bottom-left)
// and a tap zone (everywhere else). Multi-touch is supported: one finger
// can hold the d-pad while another taps to destroy.

import { pushPending } from './state.js';

const DPAD_ZONE = { xFrac: 0.55, yFrac: 0.40 }; // bottom-left rectangle of screen

export function bindTouchInput(canvas, dpad) {
  let dpadPointerId = null;

  function inDpadZone(x, y) {
    return x < window.innerWidth * DPAD_ZONE.xFrac
        && y > window.innerHeight * (1 - DPAD_ZONE.yFrac);
  }

  function onPointerDown(e) {
    const x = e.clientX;
    const y = e.clientY;
    if (dpadPointerId === null && inDpadZone(x, y)) {
      dpadPointerId = e.pointerId;
      dpad.show(x, y);
      canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
    } else {
      // Tap zone — interpret as an aim point for now (Stage 0: destroy).
      pushPending({ type: 'TapAt', screenX: x, screenY: y });
    }
    e.preventDefault();
  }

  function onPointerMove(e) {
    if (e.pointerId === dpadPointerId) {
      dpad.move(e.clientX, e.clientY);
      e.preventDefault();
    }
  }

  function onPointerUp(e) {
    if (e.pointerId === dpadPointerId) {
      dpad.hide();
      dpadPointerId = null;
      e.preventDefault();
    }
  }

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);

  // Prevent iOS rubber-band & double-tap zoom.
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
}
