// Shared input state. Touch and desktop input modules write here; main.js
// reads from it each tick and clears the pending action queue.

export const inputState = {
  // Movement intent vector. x is right/left, y is forward/back. Magnitude
  // 0..1 — analog from the d-pad, snap to 1 from the keyboard.
  intent: { x: 0, y: 0 },
  // One-shot events queued by raw input handlers, drained by main.js.
  pending: [],
};

export function pushPending(event) {
  inputState.pending.push(event);
}

export function drainPending() {
  if (inputState.pending.length === 0) return null;
  const drained = inputState.pending;
  inputState.pending = [];
  return drained;
}
