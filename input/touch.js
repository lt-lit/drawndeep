// Touch / pointer input.
//
// UX: any drag becomes movement (a floating d-pad anchors at the touch's
// origin point and tracks the finger). Any release without dragging
// past a small threshold is a tap, dispatched as a destroy event.
// Multi-touch: one finger can drive the d-pad while another taps.

import { pushPending } from './state.js';

const DRAG_THRESHOLD_PX = 6;

export function bindTouchInput(canvas, dpad) {
  // pointerId -> { startX, startY, currentX, currentY, mode: 'pending'|'dpad' }
  const pointers = new Map();
  let dpadPointerId = null;

  function onPointerDown(e) {
    pointers.set(e.pointerId, {
      startX: e.clientX,
      startY: e.clientY,
      currentX: e.clientX,
      currentY: e.clientY,
      mode: 'pending',
    });
  }

  function onPointerMove(e) {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    p.currentX = e.clientX;
    p.currentY = e.clientY;

    if (p.mode === 'pending') {
      const dist = Math.hypot(p.currentX - p.startX, p.currentY - p.startY);
      if (dist > DRAG_THRESHOLD_PX && dpadPointerId === null) {
        p.mode = 'dpad';
        dpadPointerId = e.pointerId;
        dpad.show(p.startX, p.startY);
      }
    }
    if (p.mode === 'dpad') {
      dpad.move(p.currentX, p.currentY);
    }
  }

  function onPointerUp(e) {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    if (p.mode === 'pending') {
      // Released without crossing the drag threshold: it's a tap.
      pushPending({ type: 'TapAt', screenX: p.currentX, screenY: p.currentY });
    } else if (p.mode === 'dpad') {
      dpad.hide();
      dpadPointerId = null;
    }
    pointers.delete(e.pointerId);
  }

  // Bind on window so a pointer that drifts off-canvas (e.g. onto the HUD,
  // or off the screen edge) keeps reporting. The CSS sets pointer-events:none
  // on every #ui child so this does not steal taps from real UI controls.
  window.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);

  // Prevent iOS pinch / double-tap zoom; touch-action on the canvas handles scrolling.
  document.addEventListener('gesturestart', (e) => e.preventDefault());
}
