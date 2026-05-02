# Drawn Deep — repo notes for Claude Code

See `DrawnDeepPrototypeDesign.md` for the full design. This file is the
short version for working in the repo.

## Architectural rules (load-bearing — do not violate without discussion)

1. **Pure functional reducer.** All game-state mutation goes through
   `reducer(state, action) => newState` in `sim/state.js`. The reducer must
   be a pure function: no DOM, no audio, no `console.log`, no `Math.random`,
   no `Date.now`, no network. Anything `/sim` can't see, it can't depend on.

2. **Actions as serializable messages.** Every state change is a typed
   action with a JSON-serializable payload. Never poke at state directly
   from `/render` or `/ui`.

3. **Seeded RNG.** Randomness lives in the seeded PRNG in `sim/rng.js`.
   The reducer threads the seed through state. Same state + same action
   sequence = same result, every time.

4. **Time as state, not wall clock.** Game logic uses tick counts and turn
   numbers. The renderer can use real time for animation; the simulation
   cannot. Variable-rate input from the renderer enters the sim through
   fixed-timestep `Tick` actions in `main.js`.

## Folder structure

```
/index.html       entry
/main.js          game loop — wires sim, render, input
/sim/             pure logic. imports nothing outside /sim.
/render/          reads sim state, writes to Three.js scene. never mutates state.
/ui/              DOM overlays (d-pad, card fan, HUD). dispatches actions.
/input/           translates raw events into actions or input intent.
```

The single most important rule: **`/sim` imports nothing outside `/sim`.**
If this holds, the simulation is portable to a Node server unchanged. If
it doesn't, future multiplayer is a rewrite.

## Hosting

Static site on GitHub Pages. No build step, no bundler, no TypeScript.
Three.js is loaded via importmap from a CDN. The presence of `.nojekyll`
disables Jekyll processing so files starting with `_` are served as-is.

## Running locally

Any static file server, e.g.:

```
python3 -m http.server 8000
```

Then open `http://localhost:8000`. Modules require HTTP (file:// won't work
for ES module imports).

## Current stage

**Stage 0** — voxel rendering POC. Hand-authored test floor, billboarded
character, fixed camera, virtual d-pad, tap-to-destroy. No game logic
beyond movement + destruction.

Next up: Stage 1 procgen (room+tunnel generator extruded to voxels).
