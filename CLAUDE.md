# Drawn Deep — repo notes for Claude Code

See `DrawnDeepPrototypeDesign.md` for the full design (v2). This file is the
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
   sequence = same result, every time. The floor assembler obeys the same
   rule: same floor seed = same floor.

4. **Time as state, not wall clock.** Game logic uses tick counts and turn
   numbers. The renderer can use real time for animation; the simulation
   cannot. Variable-rate input from the renderer enters the sim through
   fixed-timestep `Tick` actions in `main.js`.

5. **`/sim` imports nothing outside `/sim`.** Content JSON is loaded by
   `main.js` and passed in as plain data — `/sim` never fetches. If this
   rule holds, the simulation is portable to a Node server unchanged.

## Content pipeline (v2 — read Part 2 of the design doc before authoring)

Rooms and characters are **data files** in `/data/rooms/` and
`/data/characters/`, authored by Claude Code sessions in small batches
(5–10) and **curated by the developer** in `/tools/viewer.html` before they
ship. Key rules:

- Every room template needs a stated idea in its `notes` field (a material
  set piece, a traversal wrinkle, combat geometry, a landmark, or a secret).
  No idea → don't commit it.
- Self-review each batch (four-angle readability, scale table, connector
  visibility) and cull your weakest rooms before the developer sees them.
- Never edit a developer-approved template unless asked.
- The runtime assembler (`sim/assemble.js`) makes no aesthetic decisions —
  all design taste lives in the template library.

## Folder structure

```
/index.html       entry + importmap
/main.js          game loop — loads content JSON, wires sim, render, input
/sim/             pure logic. imports nothing outside /sim.
/render/          reads sim state, writes to Three.js. never mutates state.
/ui/              DOM overlays (d-pad, rotate buttons, card fan, HUD).
/input/           raw events → actions / input intent.
/data/            game content as data (rooms, characters, biomes, cards).
/tools/           viewer.html (curation), cavegen.html (design-time caves).
```

## Hosting

Static site on GitHub Pages. No build step, no bundler, no TypeScript.
Three.js / cannon-es / Howler via CDN importmap, versions pinned.
`.nojekyll` keeps Jekyll off. Content JSON loads via relative `fetch`.

## Running locally

```
python3 -m http.server 8000
```

Then `http://localhost:8000`. ES modules require HTTP (`file://` won't work).

## Current stage

**Stage 1** — camera, character, traversal. Proven on the hand-authored
test floor before any procgen work. Split into sub-stages:

- **1a — camera (done):** snap-rotate orbit camera in `render/camera.js`
  (4 diagonal yaws, ~250ms tween, ~50° tilt — tune on device),
  ⟲/⟳ buttons + Q/E, camera-relative d-pad (intent rotated to world
  space in `main.js` before it enters `Tick`), per-chunk occlusion fade.
- **1b — character (done):** voxel-part player (`render/characters.js`
  clip set + `/data/characters/player.json`, one InstancedMesh per
  character); cannon-es death crumble; billboard sprite code retired.
  Debug clip keys C/H/X (desktop) until the sim emits combat events.
- **1c — traversal:** walkable-height-map collision (`sim/walkable.js`,
  step ≤2, free drop); platforms/ramps and a sunken pit added to the
  test floor to prove it.

Stage 0 (voxel rendering POC) is complete on `main`. The old CA procgen
branch (`claude/procgen-dungeon-design-Sq4hh`) is superseded — salvage its
2D CA into `/tools/cavegen.html` and its 3D wall-sculpting into the
`roughen_walls` decorator during Stage 2, then delete the branch.

Do not skip ahead. Check the design doc's NOT-in-v1 list before adding
anything.
