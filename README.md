# Drawn Deep

A 2.5D voxel dungeon-crawling deckbuilder for mobile web.

See [`DrawnDeepPrototypeDesign.md`](./DrawnDeepPrototypeDesign.md) for the design.

## Status: Stage 0 prototype

Voxel rendering proof-of-concept with the architectural skeleton in place.
What works:

- Hand-authored voxel test floor (stone walls, dirt floor, wooden crates, water pool, pillars)
- Billboarded player sprite with smooth follow camera
- Real-time movement with per-axis sliding collision against voxels
- Touch: floating virtual d-pad (bottom-left), tap world to destroy a voxel
- Desktop: WASD / arrow keys to move, click to destroy

What's not here yet — by design:

- Procgen floors (Stage 1)
- Material cellular automata, fire/water flow, debris physics (Stage 2)
- Cards, casting, targeting (Stage 3)
- Combat, enemies (Stage 4)
- Floor progression (Stage 5)

## Run locally

Any static file server. For example:

```
python3 -m http.server 8000
```

Then open <http://localhost:8000> on a desktop browser, or open the same URL
on your phone (replace `localhost` with your machine's IP).

## Deploy

The repo is a static site. Push to `main` (or whatever branch GitHub Pages
is configured to serve from) and GitHub Pages will host it. The
`.nojekyll` file ensures Pages serves the files as-is without Jekyll
processing.

## Architecture

See [`CLAUDE.md`](./CLAUDE.md) for the rules.

```
/index.html                entry point
/main.js                   game loop
/sim/                      pure simulation. imports nothing outside /sim.
  state.js                 reducer + initial state
  voxels.js                voxel grid + materials
  floor.js                 hand-authored test floor (placeholder for procgen)
  rng.js                   seeded PRNG
/render/                   reads sim, writes to Three.js scene.
  scene.js                 scene + camera + per-frame render
  voxel-mesh.js            voxel grid -> InstancedMesh
  sprites.js               billboarded player sprite (procedural canvas art)
/ui/
  dpad.js                  floating virtual d-pad
/input/
  state.js                 shared input state (intent + pending events)
  touch.js                 pointer events for mobile
  desktop.js               keyboard + mouse for testing
```
