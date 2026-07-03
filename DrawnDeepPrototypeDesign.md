# Drawn Deep — Design & Build Doc (v2)

This is the single source of truth for the Drawn Deep project. If you are a Claude Code session reading this file, this is your operating manual. Read it fully before making changes.

**This doc replaces the v1 design entirely.** The three headline changes from v1, and why:

1. **Procgen is now template-based, not algorithmic.** The v1 cellular-automata cave generator (branch `claude/procgen-dungeon-design-Sq4hh`) produced levels that were structureless and perceptually identical across seeds. This was not a tuning failure — a CA converges to one connected organic blob with no rooms, no chokepoints, no destinations, and no critical path, regardless of parameters. The replacement is a library of **designed room templates stored as data files in the repo**, assembled at runtime by a connector-matching layout algorithm. Design intent lives in reviewable artifacts, not inside an algorithm.
2. **Characters are 3D voxel-part models, not billboarded sprites.** Rigid voxel parts (head, torso, limbs) defined as data, animated procedurally. They rotate correctly under the new camera, match the voxel world, require no external art pipeline, and are fully authorable as JSON.
3. **Snap-rotate camera and light in-room verticality.** The camera yaws in 90° steps between four fixed angles. Rooms may contain pits, ledges, and raised platforms; room-to-room connections stay at ground level.

The doc is organized in four parts:

1. **What we're building** — the game vision and design
2. **The content pipeline** — how rooms and characters get made (new, load-bearing)
3. **How we're building it** — architecture, stack, and rules
4. **What to build next** — stages and immediate scope

---

# Part 1: What we're building

## The pitch

A 3D voxel dungeon-crawling deckbuilder for mobile web. The player descends through procedurally assembled voxel dungeons, casting cards as spells that interact with destructible terrain and simulated materials. Combat is turn-based and tactical; exploration is real-time. Hosted as a static site on GitHub Pages.

Three influences:
- **Slay the Spire / Inscryption** — deckbuilder roguelike progression
- **Noita** — emergent material interactions, satisfying environmental destruction
- **Crossy Road / Cube World** — chunky voxel characters with procedural part animation

The combination doesn't currently exist in the deckbuilder genre and is the project's distinguishing premise.

## Visual style

**Full voxel.** The world is a 3D voxel grid throughout: terrain, walls, destructible furniture, and props are voxels with real volume. Characters are voxel-part models (see Part 2) — chunky, readable silhouettes built from a handful of colored boxes, animated by moving the boxes.

**Camera: snap-rotate, four angles.** The camera orbits the player at a fixed tilt (start at ~50° from horizontal; tune on device) and a fixed distance, with smooth follow. Yaw is locked to the four cardinal diagonals; the player rotates it in 90° steps via two on-screen buttons (bottom corners above the HUD) or Q/E on desktop. Rotation tweens over ~250ms. All world readability must hold at all four angles — this constrains room design (Part 2).

**Occlusion handling:** when wall voxels sit between the camera and the player, the affected chunks fade to ~25% opacity (swap to a transparent material variant per chunk). Test whether the chosen tilt makes this rare; implement the fade regardless, it will matter in tall rooms.

**No external asset packs in v1.** All art is programmer art: material-colored voxels, data-defined voxel characters. Committing to a final aesthetic is deferred until gameplay is validated.

### Voxel scale

Movement and spell shapes (cones, spheres, projectiles) are continuous floats — *not* tied to any coarser grid. The voxel grid is the only grid in the game: the unit of destruction, the unit the cellular automata operate on, and the unit templates are authored in.

| Thing | Voxels |
|---|---|
| Player character | ~10 tall, ~3 wide |
| Walls | 14 tall, 3 thick |
| Doorways | ≥7 wide, ≥11 tall |
| Pillars | 3×3 shaft, 5×5 capital |
| Furniture / props | 2–7 per side |
| Corridors | ≥4 wide |
| Step-up height (walkable) | ≤2 |
| Platform heights | 3–6 above room floor |

Implicit mapping: 1 voxel ≈ 0.2m. Ratios are the anchor; absolute numbers can tune.

### Light verticality (new)

Rooms may vary ground height per cell:

- **Platforms / ledges** — walkable surfaces 3–6 voxels above the room floor, reached by ramps or step-stacks (≤2 voxel steps). Good for loot perches, enemy vantage points, and pouring hazards downhill (water and oil flow downhill once the CA is in — verticality and materials multiply each other).
- **Pits** — cells with no ground. Falling into a marked *descent pit* drops the player to the next floor (the forced-descent mechanic). Unmarked low areas are just sunken floor within the room.
- **Rule: connectors are always at ground level.** Rooms connect to corridors on the y=1 walking plane only. No multi-tier room-to-room connections in v1. This keeps the assembler and collision simple while verticality still pays off inside rooms.

Movement collision generalizes from "flat plane" to a **per-column walkable-height map** derived from the grid: the player stands on the highest solid voxel in a column, can step up ≤2, and can drop any height (no fall damage in v1). This replaces the fixed y=1..10 body-box check.

## Core gameplay loop

1. Player begins a run with a starter deck on Floor 1
2. Explore the floor in real time, fighting encounters as they're triggered
3. Combat is turn-based, cards played from hand, environment ticking between turns
4. Win combat → loot rewards (cards, currency, items)
5. Find stairs (or fall in a descent pit) → next floor
6. Each floor's biome shifts (caves → ruins → deep) with different template families, materials, palette
7. Run ends on death or completion of the final floor
8. Meta-progression unlocks for the next run (deferred — exact form TBD)

## Card system

Cards are the player's vocabulary in both combat and exploration.

### Card grammar

Cards combine three orthogonal properties:

- **Shape** — targeting template (radius, cone, line, self, area)
- **Element** — material interaction (fire, frost, force, earth, shadow, arcane)
- **Modifier** — additional rules (pierce armor, apply poison, draw cards, transform terrain, persistent effects)

A card is a data object: `{shape: "radius_3", element: "fire", modifier: "ignite_oil"}`. Many cards are described as data rather than code, which keeps the system extensible and balanceable.

### Casting

In combat: cards cost mana, played from a hand drawn each turn.

Out of combat: cards can be cast freely against the environment. No combat resources used. This is mechanically important — blowing a hole in a wall to reach a hidden room is a valid strategy and must be possible without penalty. **Secret rooms in the assembler (Part 2) exist specifically to reward this.**

### Hand size

Target ~5–7 cards. Fits a fan UI on a portrait screen and matches deckbuilder conventions.

## Environment & material system

The load-bearing distinctive feature. Environments are systems the player manipulates, not backdrops. **Room templates are authored around material scenarios** — this is where "interesting to explore" actually comes from in this game (Part 2).

### Voxel terrain

Each voxel has:
- A **material** (stone, dirt, water, oil, lava, ice, wood, gas)
- An **HP** value if destructible
- Optional **state** flags (on fire, frozen, lit)

### Destruction

Voxels can be destroyed at runtime. A fireball removes voxels in a sphere; unsupported voxels above fall as physics debris (cannon-es rigid bodies); settled debris becomes rough terrain. Destruction is *the* visceral payoff — every event should feel weighty.

### Material interactions

A cellular-automata layer runs on the voxel grid:

- **Fire** propagates to adjacent flammables (oil, wood), consumes over N ticks, burns out
- **Water** flows downhill, pools
- **Oil** flammable, pools, flows slower
- **Gas** rises, drifts, dissipates, blocks line of sight
- **Lava** glows, spreads slowly, ignites flammables
- **Ice** melts under heat, becomes water when destroyed

Simple individually, emergent in combination. Verticality feeds this: liquids seek low ground, gas fills high spaces.

### Tick model

In combat: player turn → environment tick → enemy turn → environment tick. Out of combat: environment ticks at a fixed slow rate (target: 1/sec).

## Floors & progression

Each floor is a self-contained assembled dungeon (Part 2 covers assembly). Floors connect only via stairs and descent pits. The engine holds the current floor in memory; everything else is unloaded.

Target floor size: 200–400 voxels per side holding 12–25 rooms, navigable in 3–5 minutes. Early stages use smaller floors (≈128 voxels, 5–8 rooms) until chunked meshing lands.

**Biomes** group floors. Each biome defines: palette, material distribution, the template families the assembler may draw from, decorator settings, and (eventually) enemy roster and loot tables. v1 biomes: Caves (1–3), Ruins (4–6), Deep (7–9), boss arena on 10.

**Transitions:** stairs (voluntary), descent pits (forced/exploitable). Player carries deck and HP between floors.

## Combat

Detailed combat design remains **deferred** until exploration and materials are proven. Pinned:

- **Turn-based**, environment ticks between turns
- **Symmetric agent rules** — enemies have decks and play cards under player rules; "AI" is deck composition + play heuristic
- **Constrained movement in combat** — limited movement per turn, undo available
- **BG3-style template targeting** projected onto the walkable surface (not a flat plane — templates conform to the height map)

Open combat questions stay open (action economy, initiation, movement-as-card, persistence between encounters).

## Mobile UI

Portrait, one-handed where possible.

- **Floating virtual d-pad** — appears under left thumb, analog magnitude, disappears on release. **Directions are camera-relative** and re-map instantly on snap-rotate.
- **Camera rotate buttons** — two small buttons (⟲ / ⟳), bottom corners. Desktop: Q/E.
- **Card fan** bottom-right; drag across to preview, drag up past threshold to lift into aim mode, release to cast, drag back to cancel. Non-targeted cards cast on crossing the threshold. (Hearthstone/Arena convention.)
- **Aiming under snap-rotate** — the aim point raycasts from the finger through the camera onto the walkable surface. Because yaw is fixed during aiming (lock rotation while a card is lifted), drag-up always means "away from the player on screen."
- **Targeting offset (load-bearing)** — the cursor sits ~60–80px ABOVE the finger so the thumb doesn't cover the target. Do not forget this.
- **HUD** top bar: HP, mana, floor, enemy intent during combat. ~10% screen height.

## Game feel toolkit

Effects are first-class, triggered by reducer-emitted events (`{type:"ExplosionAt", ...}`), never by direct calls from game logic. Ordered by ROI: particles (~500 cap, pooled) → trauma-based screen shake → pitch-varied layered audio (Howler) → hit-stop (50–100ms) → screen flashes → haptics (`navigator.vibrate`, Android only) → part squash-and-stretch (voxel characters make this easy — scale the parts) → camera punch → slow-build telegraphs → sparing chromatic aberration.

---

# Part 2: The content pipeline

This part is new in v2 and is the heart of the revamp. Read it carefully.

## Design-time content vs runtime generation

The v1 failure was putting all design responsibility in a runtime algorithm. The v2 split:

- **Design time:** Claude Code sessions author content — room templates and character definitions — as JSON data files committed to the repo. Each file is shaped with intent: this room is built around an oil pool spanning the path; this enemy's silhouette reads as "ranged threat." Content is generated in **batches**, then **curated by the developer** in a debug viewer. Rejected content is deleted or revised. Only curated content ships.
- **Runtime:** a deliberately *dumb* assembler stitches curated templates into floors. It handles topology, placement, corridors, validation, and seeding materials — it makes no aesthetic decisions. All the taste lives in the template library.

**The developer's role is editor, not author.** Claude authors; the developer walks each room in the viewer, culls, and critiques; Claude revises. No template enters the shipping pool without having been walked.

### Rules for Claude Code sessions authoring content

1. Every template must be built around **at least one specific idea** — a material scenario, a traversal wrinkle, an ambush geometry, a landmark. Write the idea in the template's `notes` field in one sentence. If you can't state the idea, the room is filler; don't commit it.
2. **Self-review before committing** a batch: for each room, state at all four camera angles whether the connectors are visible on approach, whether the idea reads within 2 seconds of entering, and whether any geometry violates the scale table. Cull your own weakest rooms before the developer sees them.
3. Batch size: **5–10 rooms** per session. Small batches keep the review loop fast.
4. Never edit a template the developer has approved without being asked. Revisions target rejected/flagged templates only.
5. Variety across a batch beats polish on one room. Vary size, shape, idea category, and role.

## Room templates

### Format

Templates live in `/data/rooms/<family>/<id>.json`. The core spatial encoding is a **2D character grid with a legend** — compact, diffable, and directly authorable/reviewable as text. Per-cell ground height carries the light verticality; a shared **prop vocabulary** (parameterized builders: pillar, crate stack, altar, statue, ramp, brazier…) places 3D detail without encoding full 3D volumes.

```json
{
  "id": "oil_cistern_crossing",
  "version": 1,
  "family": "ruins",
  "roles": ["combat", "hazard"],
  "difficulty": 2,
  "size": { "w": 25, "d": 21 },
  "legend": {
    "#": { "wall": "stone", "wallH": 14 },
    ".": { "ground": "stone", "groundH": 1 },
    "o": { "ground": "stone", "groundH": 1, "pool": "oil", "poolDepth": 1 },
    "P": { "ground": "stone", "groundH": 4 },
    "r": { "ramp": true, "from": 1, "to": 4 },
    "v": { "pit": "sunken", "groundH": 0 }
  },
  "cells": [
    "#########################",
    "#.......................#",
    "#..PPPP.........PPPP....#",
    "#..PPPP..ooooo..PPPP....#",
    "#..rr....ooooo....rr....#",
    "#........ooooo..........#",
    "#.......................#",
    "#########################"
  ],
  "props": [
    { "type": "pillar", "x": 6, "z": 9 },
    { "type": "brazier", "x": 12, "z": 3, "lit": true },
    { "type": "crate_stack", "x": 19, "z": 14, "material": "wood" }
  ],
  "connectors": [
    { "side": "W", "offset": 8, "width": 7 },
    { "side": "E", "offset": 8, "width": 7 }
  ],
  "markers": [
    { "type": "enemy_spawn", "x": 4, "z": 4, "tier": "normal", "note": "vantage on platform" },
    { "type": "loot", "x": 20, "z": 4, "quality": "minor" }
  ],
  "decorators": [
    { "type": "roughen_walls", "strength": 0.3 }
  ],
  "notes": "Oil pool spans the direct W–E path; a lit brazier sits one careless fireball away. Platforms flank the pool for archers. Safe route is the long way around or up over the platforms."
}
```

Field semantics:

- `cells` — exactly `d` strings of exactly `w` characters; every character must exist in `legend`. Row 0 is the room's north edge (−z).
- `legend` cell spec keys: `wall`+`wallH` (solid column, material), `ground`+`groundH` (walkable top surface), `pool`+`poolDepth` (material-filled voxels resting on ground — inert until the CA stage lands, still author them now), `ramp` `from`→`to` (auto-carved stepped incline; direction inferred from adjacent heights), `pit` (no ground; `"descent"` pits drop to the next floor, `"sunken"` are in-room low areas), `bridge`+`bridgeH` (a 1-voxel-thick destructible walkable deck at height `bridgeH`, default material wood, override via `bridgeMat`; combine with `pit` or `pool` in the same cell spec for the drop or hazard beneath — this is how "wooden bridge over a lava chasm" is authored).
- `connectors` — `side` ∈ N/S/E/W, `offset` = start cell along that edge, `width` ≥ 7. The doorway cells must be ground-level (`groundH: 1`) and the opening ≥11 tall. Rooms need 1–4 connectors; the assembler may leave extras sealed (it fills unused doorways with wall, flush).
- `markers` — semantic spawn points the runtime consumes: `enemy_spawn`, `loot`, `player_spawn` (spawn-role rooms), `stairs_down`, `secret_tell` (see secret rooms).
- `decorators` — named deterministic passes the assembler runs after stamping, parameterized per template, seeded from the floor seed: `roughen_walls` (light CA erosion of wall tops/faces — **this is where the v1 3D wall-sculpting code gets salvaged**, demoted from level generator to texture pass), `scatter_rubble`, `moss` (material tinting), etc.
- `roles` — what the assembler may use this room as: `spawn`, `stairs`, `combat`, `treasure`, `hazard`, `secret`, `arena`, `corridor_junction`.
- `family` — biome family: `caves`, `ruins`, `deep`, plus `any`.

**Rotation:** the assembler may rotate any template 0/90/180/270° when placing it (grids and connector sides rotate trivially). Templates are authored once, in one orientation, but must *read* acceptably at all four camera yaws — since the assembler also rotates, effectively every room must work from every angle. Avoid designs that only make sense from one approach.

### What makes a room worth committing

Priority order for template ideas — this is the answer to "levels aren't fun to explore":

1. **Material set pieces** (the game's soul): an oil cistern crossing the path; a flooded chamber to drain or freeze; a lava chasm with a wooden bridge; a gas-filled vault; icicle ceilings over enemies. Author the scenario, not just the pool.
2. **Traversal wrinkles** (verticality): a loot perch requiring a ramp detour; a sunken arena you fight up out of; a descent pit dare.
3. **Combat geometry**: chokepoints, flanking loops around pillars, vantage platforms, destructible cover.
4. **Landmarks**: a statue, an altar, a collapsed colonnade — something that makes *this* room recognizable so the floor stops feeling homogeneous.
5. **Secrets**: rooms with `roles: ["secret"]` attach to a neighbor with **no corridor** — a 3-thick destructible wall and a `secret_tell` marker (crack props, a rubble hint) on the visible side. Blowing a hole in the wall is the intended entry. This mechanizes the doc's oldest promise.

### The caves family and the old CA code

Organic cave rooms remain in the game — as **one template family**, not the whole generator. The v1 2D CA cave code gets repurposed into a **design-time generator tool**: a browser page at `/tools/cavegen.html` (static, no build step) that runs the CA with adjustable parameters, previews the result, and emits template JSON to copy into `/data/rooms/caves/`. Claude generates candidates with it (or replicates it in-session), then dresses them — connectors, height variation, pools, props, markers — before committing. Caves become curated rooms like everything else. Delete the `claude/procgen-dungeon-design-Sq4hh` branch once the salvage (CA functions → cavegen tool + `roughen_walls` decorator) is done.

## The assembler (runtime)

`/sim/assemble.js` — pure, seeded, no aesthetic judgment. Pipeline per floor:

1. **Plan topology.** From the biome config and floor number: room count, critical-path length (spawn → stairs), branch count and depth, required roles (1 spawn, 1 stairs, N combat, ≥1 treasure, 0–1 secret, hazard quota). Output: an abstract graph of room slots with role tags and edges.
2. **Select templates.** For each slot, pick a matching template (family + role + difficulty band) from the curated library, seeded. Avoid repeating a template within a floor; if the library forces repetition, allow at distance.
3. **Place.** Lay rooms out on a coarse placement grid via the graph (spatial embedding: place the critical path as a meandering spine, hang branches off it), choosing rotations so connectors face their edges. Maintain ≥6 voxels of solid rock between room bounding boxes.
4. **Route corridors.** Connect assigned connector pairs with L-shaped (fallback: A* on the coarse grid) corridors, ≥4 wide, 3-thick walls, ground level. Corridor length between rooms: 8–30 voxels — corridors are palate cleansers, not content.
5. **Stamp.** Write floor slab, room templates (legend → voxels, props via the prop vocabulary, pools as material voxels), corridors, then seal unused connectors.
6. **Decorate.** Run each room's decorator passes, seeded from the floor seed. Apply biome palette/material substitutions.
7. **Attach secrets.** Place secret rooms flush against a chosen host room's wall; stamp the shared wall as destructible; place the tell.
8. **Validate.** Flood-fill the walkable height map (step ≤2) from spawn; require stairs and every non-secret room reachable, every marker on walkable ground. On failure, reroll with the next seed (bounded retries, then relax constraints). Determinism rule: same floor seed → same floor, always.

The assembler consumes only `/data/rooms/**` and biome configs. It never invents geometry beyond corridors and sealing.

## Voxel characters

### Format

Characters live in `/data/characters/<id>.json`. A character is a set of rigid voxel-box **parts** in a parent hierarchy, plus parameters for a **shared procedural animation system**.

```json
{
  "id": "ember_cultist",
  "notes": "Ranged fire caster. Silhouette: tall asymmetric hood, one oversized sleeve. Reads as 'keep your distance.'",
  "heightVoxels": 10,
  "palette": { "robe": "#7a2f33", "trim": "#d8a24a", "skin": "#e8cfa8", "ember": "#ff6a00" },
  "parts": [
    { "name": "torso", "size": [4, 5, 2], "offset": [0, 3, 0], "color": "robe" },
    { "name": "head",  "size": [3, 3, 3], "offset": [0, 5, 0], "pivot": [0, -1, 0], "parent": "torso", "color": "skin" },
    { "name": "hood",  "size": [4, 4, 4], "offset": [0, 1, -0.5], "parent": "head", "color": "robe" },
    { "name": "armL",  "size": [1, 4, 1], "offset": [-2.5, 4, 0], "pivot": [0, 2, 0], "parent": "torso", "color": "robe" },
    { "name": "armR",  "size": [2, 4, 2], "offset": [3, 4, 0], "pivot": [0, 2, 0], "parent": "torso", "color": "trim" },
    { "name": "legL",  "size": [1.5, 3, 1.5], "offset": [-1, 0, 0], "pivot": [0, 3, 0], "color": "robe" },
    { "name": "legR",  "size": [1.5, 3, 1.5], "offset": [1, 0, 0], "pivot": [0, 3, 0], "color": "robe" }
  ],
  "anim": {
    "idleSway": 0.06, "idleBobHz": 0.6,
    "walkBob": 0.18, "armSwingDeg": 25, "legSwingDeg": 30,
    "castLunge": 0.35, "castArm": "armR",
    "hitRecoil": 0.3, "deathStyle": "crumble"
  }
}
```

- `size`/`offset` in voxels; `offset` is relative to the parent's pivot (or the ground origin for parentless parts). `pivot` is the part's rotation point relative to its own offset.
- Parts render as `InstancedMesh` boxes at world voxel scale. No per-voxel geometry inside a part — a part is one box. Detail comes from part count (keep to 6–12) and palette.
- **Animation is code, written once** in `/render/characters.js`: a standard clip set — `idle`, `walk`, `cast`, `hit`, `death` — implemented as procedural transforms (sin bobs, pivot swings, lunges, squash-and-stretch on the whole hierarchy) driven by the `anim` parameters. Characters differ by data, never by bespoke animation code. `deathStyle: "crumble"` detaches parts as short-lived rigid bodies via cannon-es — thematically perfect and nearly free.
- The player character is just another definition (`/data/characters/player.json`).

### Character authoring rules

Same batch-and-curate loop as rooms. Additional criteria for self-review: silhouette must be distinguishable from every other committed character at gameplay camera distance; palette must separate from all biome palettes; role must read from shape (melee = forward mass, ranged = staff/sleeve, tank = wide). The developer reviews characters in the same debug viewer (`?char=<id>` shows a turntable + all clips).

## The debug viewer

`/tools/viewer.html` — a static page sharing the game's render code. This is **the curation instrument** and gets built before any content batch:

- `?room=<id>` — load one template: walk it with normal controls, all four camera angles, regenerate decorators with a new seed on tap, overlay toggles for connectors/markers/heights.
- `?char=<id>` — turntable of a character definition cycling all animation clips.
- `?floor=<seed>` — full assembler output for a seed, with a minimap overlay of the topology graph.
- A room-list index page for batch review, with a per-room approve/reject note the developer keeps (a simple checklist in `/data/rooms/REVIEW.md` is fine — no backend).

---

# Part 3: How we're building it

## Stack

- **Three.js** — 3D rendering, CDN importmap, no build step
- **cannon-es** — rigid-body debris, projectiles, character death crumble
- **Howler.js** — audio
- **Vanilla JavaScript, ES modules** — no TypeScript, no bundler, no build step, ever
- **JSDoc** for type-ish documentation where useful
- **GitHub Pages** serving `main` directly

Workflow this must support: Claude Code commits to GitHub → Pages serves → developer tests in a mobile browser. No local tooling.

```html
<script type="importmap">
{
  "imports": {
    "three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js",
    "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/",
    "cannon-es": "https://cdn.jsdelivr.net/npm/cannon-es@0.20.0/dist/cannon-es.js",
    "howler": "https://cdn.jsdelivr.net/npm/howler@2.2.4/dist/howler.min.js"
  }
}
</script>
```

Pin versions. JSON content files load via `fetch` relative to the page (works on Pages and `python3 -m http.server`).

## Architectural rules (load-bearing, non-negotiable)

These enable a clean future multiplayer migration and, more immediately, make the game testable and deterministic. Every session must follow them.

1. **Pure functional reducer.** All state mutation via `reducer(state, action) => newState` in `/sim/state.js`. No DOM, audio, `console.log`, `Math.random`, `Date.now`, or network inside `/sim`.
2. **Actions as serializable messages.** Typed actions with JSON-serializable payloads. Nothing outside the reducer mutates state.
3. **Seeded RNG.** `mulberry32` in `/sim/rng.js`; the reducer threads the seed. Same state + same actions = same result. The assembler obeys the same rule: same floor seed = same floor.
4. **Time as state.** Turns and tick counts in the sim; wall-clock time only in the renderer. Fixed-timestep `Tick` actions bridge them in `main.js`.
5. **Rendering reads state, never mutates.** Effects subscribe to reducer-emitted events.
6. **/sim imports nothing outside /sim.** The single most important rule. Content JSON is loaded by `main.js` and passed *into* the sim as plain data — `/sim` never fetches.

## Folder structure

```
/index.html               entry, importmap
/main.js                  game loop; loads content JSON, wires sim/render/input
/sim/                     PURE LOGIC. imports nothing outside /sim.
  state.js                state shape + reducer
  rng.js                  seeded mulberry32
  voxels.js               voxel grid ops
  walkable.js             per-column height map + movement rules
  assemble.js             floor assembler (Part 2 pipeline)
  templates.js            template JSON → stamp operations; prop vocabulary
  decorators.js           roughen_walls, scatter_rubble, ... (seeded, pure)
  materials.js            material rules + CA        (Stage 5)
  cards.js                card grammar + resolution   (Stage 6)
  events.js               event types emitted by reducer
/render/
  scene.js                three.js setup
  voxel-mesh.js           chunked grid → mesh
  characters.js           voxel-part characters + procedural clip set
  camera.js               snap-rotate orbit, follow, occlusion fade, shake
  particles.js
/ui/
  dpad.js                 camera-relative virtual d-pad
  rotate.js               snap-rotate buttons
  cardfan.js              (Stage 6)
  hud.js
/input/
  touch.js  desktop.js  state.js
/effects/
  audio.js  easing.js
/data/
  rooms/<family>/*.json   room templates (curated library)
  rooms/REVIEW.md         curation notes
  characters/*.json       character definitions
  biomes.js               biome configs (palette, families, quotas)
  cards.js                (Stage 6)
  materials.js
/tools/
  viewer.html             debug viewer (rooms, characters, floors)
  cavegen.html            design-time CA cave-template generator
```

## Performance targets

- **60fps** on ~4-year-old phones (iPhone 12+, Pixel 5+); 30fps acceptable on 5–7-year-old devices; older out of scope.
- Bounded floor size; **chunked meshing** (16³ chunks, rebuild only affected chunks on destruction — chunk plumbing already exists in `voxels.js`); `InstancedMesh` for character parts and repeated props; no real-time shadows or heavy post; ~500 particle cap, pooled; debris despawns or re-freezes to static voxels after ~5s.

## Coding conventions

ES modules only. Vanilla JS, no TypeScript. Modules of moderate size (200–500 lines). Pre-allocate in hot loops; prefer `for` over `forEach`/`map` in hot paths; pool objects. Comment *why*, not *what*.

---

# Part 4: What to build next

## Scope discipline

The design history of this project repeatedly expanded toward larger ambitions. All remain **explicitly deferred**. v1 is a single-player roguelike deckbuilder with bounded scope.

### Explicitly NOT in v1 (do not build even if asked, unless the developer specifically overrides)

- Multiplayer of any kind; persistent world / MMO features; social features; leaderboards
- Multiple character classes; account systems / cloud saves
- More than 3 biomes; custom card creation; daily challenges / seeded-run UI
- External asset packs (programmer art only)
- **Rigged/skinned mesh characters** (voxel-part characters only)
- **Free-rotating camera** (snap-rotate 4×90° only)
- **Multi-tier room connections** (connectors stay at ground level; verticality is in-room only)
- Fall damage; swimming/climbing traversal
- Pet system / followers; crafting; inventory beyond cards
- A visual level editor (the JSON + viewer loop is the editor)

If any of these come up, note it and defer.

## Build stages

Each stage has a deliverable testable end-to-end on the developer's phone. Do not skip ahead. **Stage 0 (voxel rendering POC) is complete on `main`.**

### Stage 1 — Camera, character, traversal ⬅️ START HERE

**Goal:** the new presentation layer, proven on the existing hand-authored test floor.

- Snap-rotate orbit camera (4 yaws, ~250ms tween, smooth follow) + rotate buttons/keys; d-pad becomes camera-relative
- Occlusion fade for wall chunks between camera and player
- Voxel character system: `/render/characters.js` clip set (idle/walk/cast/hit/death-crumble) + `/data/characters/player.json`; billboarded sprite code retired
- Walkable-height-map collision (`/sim/walkable.js`): step-up ≤2, free drop; add a couple of platforms/ramps and a sunken pit to the test floor to prove it
- **Exit test:** walk the test floor on the phone at all four angles, climb a ramp, drop off a ledge, 60fps holds

### Stage 2 — Template format + viewer + first batch

**Goal:** the content pipeline exists and has been exercised once, end to end.

- `templates.js` (JSON → stamp) + prop vocabulary + `decorators.js` (salvage v1 3D CA as `roughen_walls`)
- `/tools/viewer.html` with `?room=` mode and the review index
- `/tools/cavegen.html`
- **First authored batch: 6–8 rooms** across ruins + caves families, each with a stated idea per the Part 2 rules — including at least one material set piece, one verticality room, one landmark room
- Developer reviews the batch in the viewer; revise per notes
- **Exit test:** developer has walked every room at all four angles and approved ≥5

### Stage 3 — Assembler

**Goal:** full floors from the curated library.

- `assemble.js` pipeline (topology → select → place → corridors → stamp → decorate → secrets → validate), deterministic per seed
- `?floor=<seed>` viewer mode with topology minimap; regenerate button in-game
- **Exit test:** ten consecutive seeds each produce a connected, completable floor; spawn→stairs walkable every time; the same seed twice produces an identical floor. (Cross-seed *distinctness* is Stage 4's exit test — it needs the full library, not the handful of Stage 2 rooms.)

### Stage 4 — Content sprint

**Goal:** enough curated content that floors stop repeating.

- Room batches to ~25–35 approved templates across all three families; character batches to a starter cast (~6–8 enemies) via `?char=` review
- Biome configs (palettes, family quotas, hazard/treasure quotas)
- At least 2 secret-room templates wired through the assembler
- **Exit test:** ten consecutive seeds produce floors that feel distinct from each other; three full runs of floor-regeneration feel varied; developer can name most rooms on sight (landmark test)

### Stage 5 — Materials & CA

Fire/water/oil/gas/lava/ice behaviors on environment ticks. The pools and braziers already authored into templates come alive. **Exit test:** ignite the oil-cistern room's pool from the brazier and watch it cascade.

### Stage 6 — Card system v0

Card grammar, fan UI, drag-up-to-aim (raycast to walkable surface, rotation locked while aiming, cursor offset above finger). Free-roam casting; blow open a secret room. 

### Stage 7 — Enemies & combat

Enemy agents with decks, symmetric rules, turn-based loop with environment ticks. Voxel cast comes alive.

### Stage 8 — Floor progression

Stairs, descent pits, biome shifts, a complete Floor 1→10 run.

### Stage 9 — Polish & content

Game-feel toolkit, audio, more cards/enemies/rooms. Iterate until shippable.

## Rules for Claude Code sessions

1. **Read this entire doc first.**
2. **Stay in the current stage.**
3. **Follow the architectural rules** — pure reducer, seeded RNG, /sim imports nothing, actions for all mutations.
4. **Follow the content-authoring rules in Part 2** when producing rooms or characters. Idea-per-room, self-review, small batches, curation before shipping.
5. **Don't add dependencies or asset packs** without explicit direction.
6. **Commit often, descriptive messages** — the developer iterates by reading diffs.
7. **Ask before scope changes**; check the NOT-in-v1 list first.

## Open questions (defer until they block progress)

- Combat action economy; combat initiation; movement-as-card; persistence between encounters
- Where the player lands after a descent-pit drop (arrival placement on the next floor)
- Exact camera tilt (tune on device at Stage 1)
- Whether corridors deserve their own mini-templates (junction rooms) once the basic carver feels bland
- Prop vocabulary final list (grow it as templates demand)
- Save system for in-progress runs; audio direction; eventual art style
- Hand size cap; maximum spell range

## What success looks like

**Stage 1:** the developer walks the test floor on their phone as a voxel character, spins the camera, climbs a ramp, and it's smooth.

**Stage 4:** ten seeds, ten distinct completable floors — the "every level feels the same" problem is dead by construction, because every room in every floor was designed and approved.

**v1:** a complete 10-floor run takes 30–60 minutes, has meaningful build decisions and enemy variety, and a 30-second video conveys "this isn't like other deckbuilders." GitHub Pages, mobile-first, free, no accounts.

**Long-term:** multiplayer/social/MMO all parked; the architecture keeps the door open without committing to it.
