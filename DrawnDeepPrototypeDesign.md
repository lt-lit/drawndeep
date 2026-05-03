# Drawn Deep — Design & Build Doc

This is the single source of truth for the Drawn Deep project. If you are a Claude Code session reading this file, this is your operating manual. Read it fully before making changes.

The doc is organized in three parts:

1. **What we're building** — the game vision and design
2. **How we're building it** — architecture, stack, and rules
3. **What to build first** — the immediate prototype scope and how to start

---

# Part 1: What we're building

## The pitch

A 2.5D voxel dungeon-crawling deckbuilder for mobile web. Player descends through procedurally generated voxel dungeons, casting cards as spells that interact with destructible 3D terrain and simulated materials. Combat is turn-based and tactical; exploration is real-time. Hosted as a static site on GitHub Pages.

Three influences:
- **Slay the Spire / Inscryption** — deckbuilder roguelike progression
- **Noita** — emergent material interactions, satisfying environmental destruction
- **Pokemon (late gen, Sword/Shield era)** — 2.5D voxel aesthetic with billboarded characters

The combination doesn't currently exist in the deckbuilder genre and is the project's distinguishing premise.

## Visual style

**2.5D Pokemon-style voxel.** Fixed-angle camera tilted toward top-down (the prototype currently sits around 25° from vertical — more map-like than Pokemon's classic ~50°), smooth follow on the player. The world is a 3D voxel grid throughout: terrain, walls, and destructible furniture and props are all voxels with real volume. Characters (player, enemies) are billboarded 2D sprites that always face the camera, keeping animation costs low and the art pipeline closer to 2D than 3D.

This visual language is distinctive in the deckbuilder genre (most deckbuilders are flat 2D) and well-suited to the destruction mechanics — voxel walls have real volume, can be visibly broken, and rubble can pile and become traversable terrain.

**No external asset packs in v1.** All art is programmer art: voxel terrain rendered with material-based colors, procedurally drawn billboard sprites for characters. The aesthetic decision (what art style to commit to) is deferred until the gameplay is validated. See the open questions doc for the eventual decision tree.

### Voxel scale

Movement and spell shapes (cones, spheres, projectiles) are continuous floats — *not* tied to any coarser grid. The voxel grid is the only grid in the game, and voxels are the unit of destruction and the unit the cellular automata operate on. Procgen carves rooms, corridors, and props directly into voxels. There is no separate "logical cell" or "tile" concept that the runtime sees.

The prototype settled on these dimensions after early playtesting:

| Thing | Voxels |
|---|---|
| Player character | ~10 tall, ~3 wide |
| Walls | 14 tall, 3 thick |
| Doorways | ≥7 wide, ≥11 tall |
| Pillars | 3×3 shaft, 5×5 capital |
| Furniture / props | 2-7 per side (crate, altar, statue) |
| Corridors | ≥4 wide |

These set the implicit "1 voxel ≈ 0.2m" mapping. The numbers will tune over time but the relative ratios are the design's anchor — anything taller/larger than the player towers; anything 2-3 voxels is hand-prop scale.

---
**2.5D Pokemon-style voxel.** Fixed-angle camera tilted ~50° from vertical, smooth follow on the player. Walls extrude as 3D voxel geometry from a 2D logical grid. Characters and props are billboarded 2D sprites that always face the camera. Art pipeline stays close to 2D; rendering is 3D.

**No external asset packs in v1.** All visuals are programmer art: voxels rendered as colored cubes with material-based shading, characters as procedurally-drawn billboard sprites. The aesthetic decision (real assets, what style) is deferred until gameplay is validated. Do not add asset packs to the project without explicit user direction.

## Core gameplay loop

1. Player begins a run with a starter deck on Floor 1
2. Explore the floor in real-time, fighting encounters as they're triggered
3. Combat is turn-based, with cards played from hand, environment ticking between turns
4. Win combat → loot rewards (cards, currency, items)
5. Find stairs (or fall in a pit) → descend to the next floor
6. Each floor's biome shifts (caves → ruins → deeper levels) with different procgen rules, materials, aesthetic
7. Run ends on death or completion of the final floor
8. Meta-progression unlocks for next run (deferred — exact form TBD)

Standard roguelike-deckbuilder loop. Real-time exploration plus turn-based combat plus deep environmental interaction is the differentiator.

## Card system

Cards are the player's vocabulary in both combat and exploration.

### Card grammar

Cards combine three orthogonal properties:

- **Shape** — targeting template (radius, cone, line, self, area). Drives how the player aims.
- **Element** — material interaction (fire, frost, force, earth, shadow, arcane). Drives what materials it affects.
- **Modifier** — additional rules (pierce armor, apply poison, draw cards, transform terrain, persistent effects).

A card is a data object: `{shape: "radius_3", element: "fire", modifier: "ignite_oil"}`. This grammar lets us describe many cards as data rather than code, which makes the system extensible and balanceable.

### Casting

In combat: cards cost mana, played from a hand drawn each turn from the deck.

Out of combat: cards can be cast freely against the environment for exploration, testing, or fun. No combat resources used. This is mechanically important — blowing a hole in a wall to reach a hidden room is a valid strategy and must be possible without combat penalty.

### Hand size

Target ~5-7 cards in hand. Fits a fan UI on a portrait mobile screen and matches deckbuilder conventions.

## Environment & material system

This is the load-bearing distinctive feature of the game. Environments are systems the player manipulates, not backdrops.

### Voxel terrain

The world is a 3D grid of voxels. Each voxel has:
- A **material** (stone, dirt, water, oil, lava, ice, wood, gas)
- An **HP** value if destructible
- Optional **state** flags (on fire, frozen, lit)

Procgen carves walls, floors, corridors, and props directly into the voxel grid. There is no intermediate logical-cell representation the runtime sees — rooms are placed and walls are 3 voxels thick because we picked 3, not because some upstream tile got expanded. Materials drive both gameplay (interactions) and rendering (color, lighting).
Walls extrude vertically from the 2D logical grid. A "stone wall" cell becomes a column of stone voxels of fixed height. A "floor" cell is empty above a single floor voxel. Materials drive both gameplay rules and rendering colors.

### Destruction

Voxels can be destroyed at runtime. A fireball removes voxels in a sphere around impact. The wall now has a 3D hole. Voxels above the hole, no longer supported, can fall as physics debris (rigid bodies). Settled debris becomes rough terrain that slows movement.

The destruction model is *the* visceral payoff. Every destruction event should feel weighty and consequential.

### Material interactions

A small cellular automata layer runs on top of the voxel grid for material behaviors:

- **Fire** propagates to adjacent flammable materials (oil, wood, vegetation), consumes them over N ticks, then burns out
- **Water** flows downhill across voxel terrain, finds low spots, pools
- **Oil** is flammable and pools like water, flows slower
- **Gas** rises, drifts, dissipates over time, blocks line of sight
- **Lava** glows, spreads slowly, ignites flammables on contact
- **Ice** can be melted by heat, frozen by cold, becomes water when destroyed

Simple individually, emergent in combination. Oil + spark = fire. Frost + lava = steam (vision-blocking gas). Water + electric spell = chained damage.

### Tick model

The environment ticks between turns in combat. Player turn → environment tick → enemy turn → environment tick. Each tick is one CA pass plus settling physics for any falling debris.

Out of combat (free roam), the environment ticks at a slower fixed rate (target: once per second) so material effects continue evolving while the player moves.

## Floors & progression

### Floor structure

Each floor is a self-contained procgen dungeon. Floors connect only via stairs/pits. The engine holds the current floor (and possibly a cached previous floor) in memory; everything else is unloaded. This bounds memory and rendering predictably.

Target floor size: ~200-400 voxels per side at the established scale, holding 20-60 rooms with the room/corridor mix described above. Navigable in 3-5 minutes by an experienced player. Smaller floors (96 voxels per side, 6-10 rooms) are appropriate for the early prototype stages before chunked meshing is in.

### Biomes

Floors group into biomes. Each biome has:
- Color palette
- Material distribution (caves favor moss/water; ruins favor stone/dust; sewers favor water/sludge)
- Procgen rules (caves are organic; ruins are rectangular; sewers are linear)
- Special features (lava in deep biomes, ice up top, etc.)
- (Eventually) enemy types and loot tables

v1 biomes: Caves (1-3), Ruins (4-6), Deep (7-9), boss arena on Floor 10. Adjustable once gameplay is felt.

### Inter-floor transitions

- **Stairs** — voluntary descent. Player chooses when to go down.
- **Pits** — forced descent. Falling drops you to the next floor with no preparation. Can be exploited deliberately (cast wall-break on the floor to skip ahead).
- (Possible) **multiple staircases** on some floors leading to different next biomes for replayability.

Player carries deck and HP between floors. Each new floor is freshly generated.

## Combat

Detailed combat design is **deferred** until the environment and exploration prototype is working. Combat design will inform and be informed by what's actually possible in the world.

### What's pinned for combat

- **Turn-based**, environment ticks between turns
- **Symmetric agent rules** — enemies have decks and hands and play cards under the same rules as the player. "AI" is just deck composition + play heuristic, not bespoke behavior trees. Load-bearing simplification.
- **Movement during combat is constrained** — limited movement points per turn, undo button available since it's turn-based
- **BG3-style template targeting** for spells, projected onto the ground plane

### Open combat questions (defer until prototype works)

- How combat is initiated (line of sight? proximity? scripted encounters?)
- Action economy (mana? AP? both?)
- Whether movement in combat is a card play or a free action
- Persistence between encounters

## Mobile UI

Designed for portrait mode, one-handed where possible.

### Free-roam exploration

- **Floating virtual d-pad** — appears under left thumb on touch, analog magnitude (closer to center = slower walk), disappears on release. No fixed position; accommodates any grip.
- **Card fan** at bottom-right shows player's hand as a fan of small previews
- **Drag thumb across fan** → card under thumb pops up and grows for readability
- **Drag thumb upward past a threshold** → card lifts into aiming mode, fan dims, spell template appears at finger
- **Release in aim mode** → cast at target position (offset above finger so it isn't blocked by thumb)
- **Drag back below threshold before release** → cancel
- **For non-targeted cards** (heal, draw, etc.) → crossing the threshold *is* the cast, no aim step

This gesture matches Hearthstone and MTG Arena. Players muscle-memory it within minutes.

### Combat UI

Camera locks to combat area when combat begins. D-pad becomes movement-card play (limited per turn) instead of free roam. Specifics deferred until combat is implemented.

### HUD

Top bar: HP, mana, current floor, enemy intent icons during combat. Always visible, ~10% screen height.

### Targeting offset (load-bearing detail)

When aiming a spell, the targeting cursor must be offset ~60-80px ABOVE the finger position. Otherwise the player's thumb covers what they're aiming at. This is the single most important "feels good vs. feels bad" detail in mobile aiming. Don't forget it.

## Game feel toolkit

Effects are first-class. Every spell cast should feel weighty. The toolkit, ordered by ROI:

1. **Particle system** — sparks, smoke, embers, debris, sparkles, trails, bursts. ~500 particles max active. Hand-rolled.
2. **Screen shake** — trauma-based model (shake intensity = trauma², trauma decays over time, impacts add trauma). Shake the camera, not the world.
3. **Audio with pitch variation** — every sound effect plays with ±10% random pitch variation to avoid fatigue. Layer 2-3 sounds per impact (low rumble + mid impact + high sparkle). Use Howler.js.
4. **Hit-stop / freeze frames** — on big spell impacts, freeze the entire game for 50-100ms before the explosion plays out. Single most underused tool in indie games. Transforms heavy hits.
5. **Screen flashes** — brief full-screen color overlay (white, red, blue) that fades over 100-200ms on impact. Subtle for small spells, aggressive for big ones.
6. **Haptics** — `navigator.vibrate(50)` on Android browsers. iOS Safari doesn't support, accept that.
7. **Squash & stretch** — sprites squash on impact axis, stretch when moving fast. Deferred until proper sprite animation exists.
8. **Camera punch** — 2-5% zoom-in for ~100ms on big impacts. Combined with shake, makes hits feel weighty.
9. **Slow-build telegraphs** — for impactful spells, delay the actual effect by a fraction of a second. Anticipation makes the payoff feel bigger.
10. **Chromatic aberration** — brief red/blue channel offset on impact (~80ms). Use sparingly — only critical hits.

Effects are triggered by game events (`{type: "ExplosionAt", x, y, magnitude}`), not by direct calls in the game logic. The reducer stays pure; the render layer subscribes to events and produces effects.

---

# Part 2: How we're building it

## Stack

- **Three.js** for 3D rendering — loaded from CDN, no build step
- **cannon-es** for 3D rigid body physics — debris, projectiles. Loaded from CDN.
- **Howler.js** for audio — loaded from CDN
- **Vanilla JavaScript** with ES modules — no TypeScript, no bundler, no build step
- **JSDoc comments** for type-like documentation when useful
- **GitHub Pages** for hosting — serves directly from `main` branch

This stack supports the developer's iteration workflow: Claude Code commits to GitHub, GitHub Pages serves the result, developer tests in mobile browser. No local tooling required.

### CDN URLs to use

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

Use this importmap (or equivalent CDN paths) in `index.html`. Pin specific versions for reproducibility.

## Architectural rules (load-bearing)

These rules exist to enable a smooth migration to networked multiplayer when/if it's added later. They are non-negotiable. Following them costs maybe 10-20% extra thinking during development; ignoring them means a future rewrite. Any session working on this project must follow them.

### 1. Pure functional reducer

All game state mutations go through a single function: `(state, action) => newState`. The reducer is pure. No side effects. No DOM access, no audio playback, no `console.log`, no `Math.random()`, no `Date.now()`, no fetches. If it's not in the inputs, it cannot influence the output.

This rule means the reducer can be run on a server identically to in the browser. It also means the simulation is testable, replayable, and debuggable.

### 2. Actions as serializable messages

Every state change is a typed action with a serializable payload. Examples:

```js
{type: "MoveAgent", agentId: "player", direction: {x: 1, y: 0}}
{type: "PlayCard", agentId: "player", cardId: "fireball_1", target: {x: 12.5, y: 8.3}}
{type: "EnvironmentTick"}
```

Never mutate state directly anywhere outside the reducer. Never use ad-hoc objects without a `type` discriminator. This makes the action stream loggable, replayable, networkable.

### 3. Seeded RNG

Randomness lives in a seeded PRNG that is part of the game state. Use `mulberry32` or equivalent. The reducer advances the seed when it draws a random number; it never calls `Math.random()`.

```js
// Pure
function reduce(state, action) {
  if (action.type === "RollDamage") {
    const { value, nextSeed } = rng(state.seed);
    return { ...state, lastDamage: value, seed: nextSeed };
  }
}
```

This makes the game deterministic. Same state + same action sequence → same result, every time. Required for any future multiplayer or replay system.

### 4. Time as state, not wall clock

Game logic uses turn numbers and tick counts, not real time. The renderer can use real time (animations, particle motion, audio timing). The simulation cannot.

If a card has a "lasts 3 turns" effect, that's tracked as `expiresAtTurn: 47` in state, not as a wall-clock timer.

### 5. Rendering reads state, never mutates it

The render layer is a function of game state. It can compute effects, run animations, play audio — all driven by state and events. It cannot directly modify state. UI input creates actions, dispatched to the reducer.

### 6. /sim imports nothing

The single most important folder rule: nothing in `/sim` imports from anywhere else in the project. No `/render`, no `/ui`, no `/effects`, no DOM, no Three.js, no Howler. Just other files within `/sim` and pure data.

If this holds, the simulation is portable to a Node server unchanged. If it doesn't, multiplayer migration is a rewrite.

## Folder structure

```
/index.html              entry point, includes the importmap
/main.js                 game loop, wires everything together
/sim/                    PURE GAME LOGIC. Imports nothing else.
  state.js               state shape + reducer
  rng.js                 seeded mulberry32
  cards.js               card definitions + resolution
  materials.js           material rules + cellular automata
  voxels.js              voxel grid mutations
  events.js              event types emitted by reducer
/render/                 reads sim state, never mutates
  scene.js               three.js scene setup
  voxel-mesh.js          voxel grid → mesh conversion
  sprites.js             billboarded character/prop rendering
  particles.js           particle effects
  screen.js              camera, screen shake, flashes
/ui/                     dispatches actions to sim
  cardfan.js             card hand rendering + interaction
  dpad.js                virtual d-pad
  targeting.js           spell aim overlay
  hud.js                 HP/mana/floor display
/input/
  touch.js               touch event → action translation
  desktop.js             keyboard/mouse for desktop testing
/effects/
  audio.js               Howler wrapper
  easing.js              lerp + easing functions
/procgen/
  floor.js               floor generation pipeline
  rooms.js               room placement
  tunnels.js             corridor carving
  biomes.js              biome rule definitions
/data/                   game content as data
  cards.js               all card definitions
  materials.js           material properties
  biomes.js              biome configs
/assets/                 (empty for v1 — no external assets yet)
```

## Performance targets

- **60fps** on phones from the last 4 years (iPhone 12+, Pixel 5+, Galaxy S20+)
- **30fps acceptable** on phones 5-7 years old
- Older phones explicitly out of scope

Strategies:
- Bounded floor size (no streaming, predictable cost)
- Chunked voxel meshing (regenerate only affected chunks on destruction)
- Instanced rendering for sprites (use Three.js InstancedMesh)
- Conservative effects (no real-time shadows, no expensive post-processing)
- Capped particle count (~500 max active)
- Debris despawns after settling (~5 seconds) or freezes back into static voxels
- Pool particle objects to avoid GC pressure

## Coding conventions

- ES modules with `export`/`import`. No CommonJS, no `require()`.
- Vanilla JavaScript. No TypeScript. JSDoc comments for type hints when useful.
- Modules of moderate size (200-500 lines). Don't make hundreds of tiny files.
- Pre-allocate arrays/objects in hot loops. Pool particles. Avoid GC pressure on mobile.
- Prefer `for` loops over `forEach`/`map` in hot paths (perf-sensitive code).
- Comment why, not what. Don't comment self-explanatory code.

---

# Part 3: What to build first

## Scope discipline

The history of this design conversation included repeatedly expanding scope toward larger ambitions (multiplayer, MMO, social features, more biomes, real assets, etc.). All those ambitions are **explicitly deferred**. v1 is a single-player roguelike deckbuilder with bounded scope.

### What's explicitly NOT in v1 (do not build these even if asked unless the developer specifically overrides)

- Multiplayer of any kind
- Persistent world / MMO features
- Social features (chat, friends, trading)
- Leaderboards
- Multiple character classes
- Account systems / cloud saves
- More than 3 biomes
- Custom card creation by players
- Daily challenges / seeded runs
- Real asset packs (programmer art only)
- 3D character models (billboarded sprites only)
- Free-rotating camera (fixed angle only)
- Verticality within a single floor (floors are 2D extruded into 3D)
- Pet system / followers
- Crafting
- Inventory beyond cards (no equipment slots, no consumables that aren't cards)

If any of these come up in conversation as a possibility, note it and defer. Do not implement.

## Build stages

The project builds in stages. Each stage has a clear deliverable and is testable end-to-end on the developer's mobile device. Do not skip ahead.

### Stage 0 — Voxel rendering proof of concept ⬅️ START HERE

**Goal**: confirm the architecture runs smoothly on the developer's phone before building gameplay on top.

**Deliverable**: a single web page where the developer can:
- Open the page on their phone
- See a 3D voxel dungeon room from a fixed-angle camera
- Walk around with a virtual d-pad (left thumb)
- Tap anywhere to "blow up" voxels in a sphere around the tap (instant test of destruction)
- See debris spawn from destruction events and settle
- Verify performance is smooth (60fps target)

**What to build**:
- `index.html` with the importmap
- `main.js` setting up the Three.js scene and game loop
- A hand-coded test floor (no procgen yet) — maybe a 30×30 grid with some walls, dirt floor, water pool, oil patch, lava pit
- Voxel mesh generator (`/render/voxel-mesh.js`) that turns the grid into Three.js geometry. For Stage 0, simple "render every visible face" is fine; greedy meshing can come later.
- Billboarded character sprite (`/render/sprites.js`) — drawn procedurally, like a hooded figure with a torch. Always faces camera.
- Fixed-angle camera with smooth follow (`/render/screen.js`)
- Floating virtual d-pad (`/ui/dpad.js`, `/input/touch.js`)
- Tap-to-destroy handler that removes voxels in a sphere and spawns debris rigid bodies via cannon-es
- Pure reducer in `/sim` for the game state (player position, voxel grid)
- Even at this stage, follow the architectural rules: actions, pure reducer, seeded RNG (even if not used for randomness yet, set it up correctly).

**What to deliberately NOT build at Stage 0**:
- Procgen
- Cards / hand UI
- Combat
- Enemies
- Multiple floors
- Sound effects (visual smoke test only)
- Materials interacting with each other (just colored voxels for now)
- Any UI beyond the d-pad

Stage 0 is a **performance and feasibility test**. If the developer's phone runs it smoothly with destruction, we know the architecture works and can build on it. If it doesn't, we need to revisit before going further.

### Stage 1 — Procgen floor generation

**Goal**: replace the hand-authored test floor with procedurally generated dungeons.

Build the room+tunnel procgen we sketched (rooms placed via jittered grid, connected with drunk-walker tunnels, CA-softened edges). Extrude the 2D grid into voxels. Generate a new floor on space-bar press (desktop) or button-tap (mobile).

### Stage 2 — Materials and CA

Add water flow, oil pools, fire propagation, gas dissipation as cellular automata running once per environment tick. Tap-to-destroy still works; tapping fire-adjacent oil should ignite it; water near lava should make steam-gas.

### Stage 3 — Card system v0

Implement the card grammar (shape × element × modifier). Add a hand of 5 placeholder cards with a fan UI at bottom-right. Implement the drag-up-to-aim gesture. Cards fire spells against the environment in free roam (no enemies yet).

### Stage 4 — Enemies and combat

Add enemy agents with their own decks. Implement turn-based combat with environment ticks between turns. Symmetric rules: enemies cast cards from their decks just like the player.

### Stage 5 — Floor progression

Stairs, pits, multiple floors, biome variation. A complete run from Floor 1 to Floor 10.

### Stage 6 — Polish and content

More cards, more enemies, more biomes, audio integration, particle effects, screen shake, all the game-feel toolkit. Iterate until shippable.

## Rules for Claude Code sessions working on this project

When making changes:

1. **Read this entire doc first.** If something seems unclear, the doc is probably the answer.
2. **Stay in the current stage.** Don't implement Stage 4 features when we're still on Stage 1.
3. **Follow the architectural rules.** Pure reducer, seeded RNG, /sim imports nothing, actions for all mutations.
4. **Don't add dependencies.** The stack is fixed: Three.js, cannon-es, Howler.js. Don't pull in additional libraries without explicit user direction.
5. **Don't add asset packs.** Programmer art only.
6. **Commit often, with descriptive messages.** The developer iterates by reading commit diffs.
7. **Ask before scope changes.** If a request would expand scope (new feature, new dependency, deviation from this doc), ask first.
8. **Check the "NOT in v1" list before adding anything.** If a feature is on that list, the answer is no, even if the request seems reasonable in isolation.

## Open questions (defer until they block progress)

- Combat action economy (mana? AP? both?)
- Whether spell targeting follows ground plane only or has true 3D targeting
- Exact biome list and progression past v1's Caves/Ruins/Deep
- Persistence between floors (do enemies stay alive on previous floors?)
- Save system for in-progress runs
- Audio direction (procedural or sample-based)
- Eventual art style (programmer art → ?)
- Hand size cap exact number
- Maximum spell range
- Cancel gesture variants

The right time to resolve each is when it blocks progress. Don't preemptively pin them down.

## What success looks like

**For Stage 0**: developer opens the URL on their phone, sees a 3D voxel dungeon, walks around with a virtual d-pad, taps to blow up walls, debris falls, performance is smooth.

**For v1**: a complete 10-floor roguelike run takes 30-60 minutes per attempt, has enough card variety for meaningful build-decisions, has enough enemy variety to stay interesting, and feels distinctive enough that a 30-second video conveys "this isn't like other deckbuilders." Hosted on GitHub Pages, mobile-first, free to play, no accounts required.

**Long-term**: TBD. Multiplayer, social features, MMO scale — all parked. The path to those features is enabled by the architecture but not committed to.
