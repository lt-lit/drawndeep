// Snap-rotate camera buttons (⟲ / ⟳), bottom corners. Pointer events
// must not bubble to window: input/touch.js listens there and would
// read a button press as a tap (voxel destroy) or a d-pad drag.

import { pushPending } from '../input/state.js';

export function createRotateButtons(rootEl) {
  makeButton(rootEl, '⟲', 'rotate-left', -1);
  makeButton(rootEl, '⟳', 'rotate-right', +1);
}

function makeButton(rootEl, label, className, dir) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'rotate-btn ' + className;
  el.textContent = label;
  el.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    e.preventDefault();
    pushPending({ type: 'RotateCamera', dir });
  });
  rootEl.appendChild(el);
}
