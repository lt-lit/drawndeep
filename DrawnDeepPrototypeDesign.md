# Drawn Deep — Design Document

*A 2.5D voxel dungeon-crawling deckbuilder for mobile web.*

---

## The pitch

You descend through a procedurally generated voxel dungeon, fighting enemies and overcoming environmental challenges by playing cards from your deck. Spells are aimed templates that interact with destructible 3D terrain and simulated materials — a fireball doesn't just damage enemies, it ignites oil pools, blows holes in walls, and sets wooden bridges aflame. Combat is turn-based and tactical; exploration is real-time. The game runs in a mobile browser, hosted as a static site.

Three influences worth naming:
- **Slay the Spire / Inscryption** — deckbuilding roguelike progression
- **Noita** — emergent material interactions, satisfying environmental destruction
- **Pokemon (late gen, Sword/Shield era)** — 2.5D voxel aesthetic with billboarded characters

Combine those three and you get a game that doesn't currently exist in the deckbuilder space.

---

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

## Core gameplay loop

1. Player begins a run with a starter deck on Floor 1
2. Explore the floor in real-time, fighting encounters as they're triggered
3. In combat: turn-based card play, environment ticks between turns, tactical positioning matters
4. Win combat → loot rewards (cards, currency, items)
5. Find stairs (or a pit) → descend to next floor
6. Each floor's biome shifts (caves → ruins → sewers → deeper levels) with different procgen rules, materials, and aesthetic
7. Run ends when player dies or completes the final floor
8. Meta-progression unlocks for next run (TBD)

This is the standard roguelike-deckbuilder loop. Familiar to anyone who's played Slay the Spire, but with real-time exploration between encounters and environmental interaction throughout.

---

## Card system

Cards are the player's vocabulary. They define what the player can do — both in combat and during exploration.

### Card grammar

Cards are composed of three orthogonal properties:

- **Shape** — the targeting template. Radius (circle around point), cone (angle from origin), line (length and width), self (no target), area (rectangle). Drives how the player aims the spell.
- **Element** — the material interaction. Fire (ignites flammables), frost (freezes water, slows enemies), force (knocks back, breaks walls), earth (creates terrain), shadow (debuffs, fear), arcane (raw damage, no material side effect).
- **Modifier** — additional rules. Pierces armor, applies poison, draws cards, costs less if conditions met, transforms terrain, creates persistent effects.

A card is some combination: `{shape: "radius 3", element: "fire", modifier: "ignite oil"}`. This grammar lets us describe many cards as data rather than code.

### Casting

In combat: cards cost mana (or whatever the resource ends up being called), played from a hand drawn each turn from your deck.

Out of combat: cards can still be cast freely against the environment for testing, exploration, or fun. No combat resources used. This is partly QoL and partly mechanically important — if blowing a hole in a wall to reach a hidden room is a valid strategy, it has to be doable without combat penalty.

### Hand size

Targeting around 5-7 cards in hand at a time. This is what fits comfortably in a fan UI on a portrait mobile screen and matches deckbuilder conventions.

---

## Environment & material system

This is the load-bearing distinctive feature of the game. Environments aren't backdrops — they're systems the player manipulates.

### Voxel terrain

The world is a 3D grid of voxels. Each voxel has:
- A **material** (stone, dirt, water, oil, lava, ice, wood, etc.)
- An **HP** value if destructible
- Optional **state** (on fire, frozen, lit)

Procgen carves walls, floors, corridors, and props directly into the voxel grid. There is no intermediate logical-cell representation the runtime sees — rooms are placed and walls are 3 voxels thick because we picked 3, not because some upstream tile got expanded. Materials drive both gameplay (interactions) and rendering (color, lighting).

### Destruction

Voxels can be destroyed at runtime. A fireball removes voxels in a sphere around impact. The wall now has a 3D hole. Voxels above the hole, no longer supported, fall as physics debris (rigid bodies). Debris can settle and become rough terrain that slows movement.

This is the visceral payoff. The player isn't just damaging enemies — they're reshaping the level.

### Material interactions

A small cellular automata layer runs on top of the voxel grid for material behaviors:

- **Fire** propagates to adjacent flammable materials (oil, wood, vegetation), consumes them over N ticks, then burns out
- **Water** flows downhill across voxel terrain, finds low spots, pools
- **Oil** is flammable and pools like water, flows slower
- **Gas** rises, drifts, dissipates over time, blocks line of sight
- **Lava** glows, spreads slowly, ignites flammables on contact
- **Ice** can be melted by heat, frozen by cold, becomes water when destroyed

These rules are simple individually but combine into emergent situations. A spell that creates a cloud of oil isn't just damage — it's a setup for a fire spell next turn. A frost spell next to lava creates steam that obscures vision.

### Tick model

The environment **ticks** between turns. Player turn → environment tick (fire spreads, water flows, gas dissipates) → enemy turn → environment tick. Each tick is one CA pass plus settling physics for any falling debris.

Out of combat (free roam), the environment ticks at a slower fixed rate (maybe once per second) so material effects continue evolving even while the player moves freely.

---

## Floors & progression

### Floor structure

Each floor is a self-contained procgen dungeon. Floors don't connect except via stairs/pits. This bounds memory and rendering — the engine only ever holds the current floor (and possibly a cached previous floor) in memory.

Target floor size: ~200-400 voxels per side at the established scale, holding 20-60 rooms with the room/corridor mix described above. Navigable in 3-5 minutes by an experienced player. Smaller floors (96 voxels per side, 6-10 rooms) are appropriate for the early prototype stages before chunked meshing is in.

### Biomes

Floors group into biomes. Each biome has:
- Color palette
- Material distribution (caves favor moss/water, ruins favor stone/dust, sewers favor water/sludge)
- Procgen rules (cave biomes generate organic shapes, ruin biomes favor rectangular rooms, sewer biomes are more linear)
- Special features (lava in deep biomes, ice in upper, etc.)
- Eventually: enemy types and loot tables

Starting biomes (for v1): Caves (1-3), Ruins (4-6), Deep (7-9). Final boss on floor 10. Subject to change once gameplay is felt.

### Inter-floor transitions

- **Stairs** are the standard descent method. Voluntary, player chooses when to descend.
- **Pits** are environmental hazards. Falling into one drops you to the next floor with no preparation. Can be exploited deliberately ("I'll cast a wall-break on the floor to skip ahead").
- Possibly: **multiple staircases** on some floors leading to different next biomes. Adds replayability.

The player carries their deck and HP between floors. Each new floor is freshly generated.

---

## Combat

Deferred to a later design phase. Holding off on detailed combat design until the environment and exploration prototype is working — combat design will inform and be informed by what's actually possible in the world.

### What's pinned down for combat

- **Turn-based**, with the environment ticking between turns
- **Symmetric rules** — enemies have decks and hands, play cards under the same rules as the player. This is a load-bearing simplification: enemy "AI" is just deck composition + play heuristic, not bespoke behavior trees.
- **Movement during combat is constrained** — limited movement points per turn, undo button available since it's turn-based
- **BG3-style template targeting** for spells with shapes/AOEs, projected onto the ground plane

### Open combat questions

How combat is initiated (line of sight? proximity? scripted?), action economy (mana? AP? both?), whether players can move freely during their own turn or whether movement is also a card play, persistence between encounters. All TBD.

---

## Mobile UI

Designed for portrait mode, one-handed-friendly where possible.

### Free-roam exploration

- **Floating virtual d-pad** appears under left thumb on touch. Analog magnitude (closer to center = slower walk). Disappears on release. No fixed position so it accommodates any grip.
- **Card fan** at bottom-right shows player's hand as a fan of small previews
- **Drag thumb across fan** → card under thumb pops up and grows for readability
- **Drag thumb upward past a threshold** → card lifts into aiming mode, fan dims, spell template appears at finger
- **Release in aim mode** → cast at current target position (offset above finger so it isn't blocked by thumb)
- **Drag back below threshold before release** → cancel
- **For non-targeted cards** (e.g., heal, draw) → crossing the threshold *is* the cast, no aim step

This gesture is the same one used by Hearthstone and MTG Arena. Players muscle-memory it within minutes.

### Combat UI

Camera locks to combat area when combat begins. D-pad becomes movement-card play (limited per turn) instead of free roam. Specifics TBD.

### HUD

Top bar shows HP, mana, current floor, enemy intent icons during combat. Always visible, ~10% of screen height.

---

## Architecture

### Stack

- **Three.js** for 3D rendering (CDN, no build step)
- **cannon-es** or similar lightweight 3D rigid body library for debris and projectile physics (CDN)
- **Howler.js** for audio (CDN)
- **Vanilla JavaScript** with ES modules — no TypeScript, no bundler, no build step
- **JSDoc** comments for type-like documentation
- **GitHub Pages** for hosting

This stack supports the core development workflow: Claude Code commits to GitHub, GitHub Pages serves the result, Andrew tests in mobile browser. No local tooling required.

### Architectural rules (load-bearing)

The game is structured to enable a smooth migration from single-player to networked multiplayer if/when that's added. The migration is painless if these rules are followed from day one and impossible if they aren't.

1. **Pure functional reducer.** Game state mutations go through a single function: `(state, action) => newState`. Pure. No side effects. No DOM, no audio, no console.log, no `Math.random()`, no `Date.now()`. If it's not in the inputs, it can't influence the output.

2. **Actions as serializable messages.** Every state change is a typed action with a serializable payload. `{type: "PlayCard", agentId, cardId, target: {x, y}}`. Never direct mutation. This makes the action stream loggable, replayable, networkable.

3. **Seeded RNG.** Randomness lives in a seeded PRNG that's part of the game state. The reducer advances the seed when it draws a random number. This makes everything deterministic — same state + same action sequence = same result, always. Required for any future multiplayer or replay system. Use mulberry32 or equivalent.

4. **Time as state, not wall clock.** Game logic uses turn numbers and tick counts, not real time. The renderer can use real time for animations; the simulation cannot.

### Folder structure

```
/index.html              entry point
/main.js                 game loop, wires everything together
/sim/                    pure game logic. No imports from anywhere else.
  state.js               state shape + reducer
  rng.js                 seeded random
  cards.js               card definitions + resolution
  materials.js           material rules + CA logic
  voxels.js              voxel grid mutations
/render/                 reads sim state, never mutates
  scene.js               three.js scene setup
  voxel-mesh.js          voxel → mesh conversion
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
  desktop.js             keyboard/mouse for testing
/effects/
  audio.js               Howler wrapper
  easing.js              lerp + easing functions
/procgen/
  floor.js               floor generation pipeline
  rooms.js               room placement
  tunnels.js             corridor carving
  biomes.js              biome rules
/data/                   game content as data
  cards.js               all card definitions
  materials.js           material properties
  biomes.js              biome configs
/assets/                 (empty for v1 — no external assets)
/docs/
  design.md              this document
  open-questions.md      unresolved decisions
  decisions.md           log of choices made and why
  ui-mobile.md           detailed UI gesture specs
  game-feel.md           effects toolkit reference
CLAUDE.md                architectural constraints for Claude Code
README.md                project overview
```

The single most important rule: **`/sim` imports from nothing else**. If this holds, the simulation is portable to a Node server unchanged. If it doesn't, multiplayer is a rewrite.

---

## Scope discipline

The history of this design conversation reveals a recurring temptation: every cool idea wants to be in v1. To ship anything, scope has to be deliberately constrained.

### What's in v1

A complete single-player roguelike deckbuilder with:
- One playable character class
- 10 floors across 3 biomes, all procgen
- 30-50 cards, hand-designed
- 5-10 enemy types
- Material system with 6-8 materials (stone, dirt, water, oil, lava, ice, wood, gas)
- Voxel destruction with rubble physics
- Mobile-first UI (free-roam d-pad + card fan + drag-to-aim)
- Combat with symmetric agent rules
- Run-based progression (start over on death)
- Sound effects and basic music
- Hosted on GitHub Pages

This is a real game. It's also a *lot of work* even with AI assistance.

### What's explicitly NOT in v1

These are good ideas worth doing later but not now:
- Multiplayer (any kind)
- Persistent world / MMO features
- Player-to-player social features
- Trading, friends lists, chat
- Leaderboards
- Multiple character classes
- Meta-progression beyond a simple unlock system
- Account system / cloud saves
- More than 3 biomes
- Custom card creation by players
- Daily challenges / seeded runs
- Spectator mode
- Real assets (use programmer art until v1.x)
- 3D character models (billboarded sprites only)
- Free-rotating camera
- Verticality within a single floor (floors are essentially 2D extruded into 3D)
- Pet system / followers
- Crafting
- Inventory beyond cards (no equipment slots, no consumables that aren't cards)

Each of these has been raised at some point as a possibility. Each is parked.

### Building in stages

The architecture supports incremental development. Roughly in order:

**Stage 0** — Voxel rendering proof of concept. Three.js scene with a hand-authored test floor, billboarded character, fixed camera, virtual d-pad, tap to destroy voxels. No game logic. **Goal: confirm the architecture runs smoothly on mobile.**

**Stage 1** — Procgen floor generation. Replace the hand-authored test floor with the room+tunnel procgen we worked out in 2D. Extrude it into voxels. **Goal: walk through procedurally-generated dungeons.**

**Stage 2** — Materials and CA. Add water, oil, lava, fire as voxel materials with cellular automata behavior. **Goal: see materials interact with each other and respond to destruction.**

**Stage 3** — Card system v0. Implement the card grammar (shape × element × modifier). Add a placeholder hand of 5 cards that cast spells against the environment in free roam. Drag-to-aim UI. **Goal: cast a fireball, blow up a wall, ignite oil, watch it spread.**

**Stage 4** — Enemies and combat. Add enemy agents with their own decks. Implement turn-based combat with environment ticks. **Goal: tactical combat that uses the environment.**

**Stage 5** — Floor progression. Stairs, pits, multiple floors, biome variation. **Goal: a complete run from floor 1 to floor 10.**

**Stage 6** — Polish and content. More cards, more enemies, more biomes, audio, particle effects, screen shake, game feel. **Goal: a game worth playing.**

Each stage has a clear deliverable. Each builds on the previous. The temptation to skip ahead must be resisted.

---

## Performance targets

- **60fps** on phones from the last 4 years (iPhone 12+, Pixel 5+, Galaxy S20+)
- **30fps acceptable** on phones from 5-7 years ago
- Older phones explicitly out of scope

Strategies:
- Bounded floor size (no streaming, predictable cost)
- Chunked voxel meshing (regenerate only affected chunks on destruction)
- Instanced rendering for sprites (Three.js InstancedMesh)
- Conservative effects (no real-time shadows, no expensive post-processing)
- Capped particle count (~500 max)
- Despawn debris after settling (or freeze it back into static voxels)

A performance test scene is part of the initial repo so we have a phone-tested baseline before any game logic exists.

---

## Open questions

These are tracked in `/docs/open-questions.md`. Brief summary:

- Combat action economy (mana? AP? both?)
- Whether spell targeting follows ground plane or has true 3D targeting
- Exact biome list and progression
- Persistence between floors (do enemies stay alive on previous floors?)
- Save system for in-progress runs
- Audio direction (procedural or sample-based)
- Eventual art style (programmer art → ?)
- Many more

The right time to resolve each is when it blocks progress, not now. Premature resolution creates committed-to designs that need to be undone when reality interferes.

---

## Decisions made (and why)

Tracked in `/docs/decisions.md`. The key ones:

- **2.5D voxel** over pure 2D — destruction satisfaction requires real volume
- **Three.js** over building a custom 3D engine — too much reinvention otherwise
- **Vanilla JS / no build step** — matches the developer's existing iteration workflow
- **No external art assets in v1** — locks in aesthetic too early
- **Discrete floors** over continuous world — bounds performance and complexity
- **Symmetric agent rules** — simplifies AI implementation by reusing the card system
- **Pure functional reducer** — enables future multiplayer migration without rewrite
- **Single-player first** — multiplayer/MMO ambitions are deferred until core gameplay works

---

## What success looks like

**For the prototype**: a phone-playable demo where you walk through a procgen voxel dungeon, cast spells that destroy the environment, and feel the satisfying loop of *aim → cast → emergent destruction*. No combat needed at this stage. If this loop is fun, the rest of the game is worth building.

**For v1**: a complete 10-floor roguelike run that takes 30-60 minutes per attempt, has enough card variety for meaningful build-decisions, has enough enemy variety to stay interesting, and feels distinctive enough that a 30-second video conveys "this isn't like other deckbuilders." Hosted on GitHub Pages, mobile-first, free to play, no accounts required.

**Long-term**: TBD. Multiplayer, social features, MMO scale — all parked for now. The path to those features is open if v1 succeeds, but committing to them before v1 ships is the road to never shipping.
