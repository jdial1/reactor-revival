# Incremental & Simulation Architecture Benchmark (v1.0)

> **Canonical source of truth:** [`design-foundations.md`](./design-foundations.md) — one pattern per component. This document is the **engineering evidence catalog** (peer deep dives, architecture friction audits).
>
> **Purpose:** Deep review of open-source browser simulation and incremental games whose **engineering patterns** align with Reactor Revival's substrate — grid physics, worker-backed ticks, save migration, and data-driven progression. This document builds an **Architectural Design Model**: what to adopt, what friction to avoid, and how each peer's "secret sauce" maps to our codebase.
>
> Companion to [`related-projects-benchmark.md`](./related-projects-benchmark.md), which covers **reactor lineage game design**. This document covers **how to build the engine** without repeating genre-specific feature checklists.
>
> **Audience:** Core contributors planning architecture, simulation integrity, state management, and Phase 2 migration.
>
> **Last updated:** 2026-07-19 (v1.2 — honesty pass: capped offline, no host TickOrchestrator, rAF-coupled sim clock)

---

## 1. Executive Summary

Reactor Revival already sits in rare company: a browser PWA with **worker physics**, **Zod-validated saves**, **intent queuing**, and **typed-array heat kernels**. Most reactor incrementals never reach this tier of engineering.

**The core realization:** Our remaining technical debt is not "missing features" — it is **dual representation**. The simulation thread (`gameLoopWorkerCore.js`) speaks Float32Array SoA; the UI thread still speaks `Tile` class instances with nested neighbor caches, display mirrors, and imperative DOM patches. The five projects below solved variants of this same split.

**Our strongest architectural differentiators today**

| Area | Reactor Revival advantage |
|------|---------------------------|
| Worker heat kernel | `runHeatStepFromTyped`, stride-packed inlet/valve/exchanger buffers |
| Intent atomicity | `intent_queue` drained at tick boundary in `serializeStateForGameLoopWorker` |
| Save pipeline | Compact tile encoding (`u16_f32f32`), versioned `migrateSave` chain |
| Data-driven balance | `part_list.json`, `upgrade_list.json`, Zod schemas |
| Test gate | Vitest coverage on offline catch-up, thermodynamics, save round-trips |

**Biggest opportunities borrowed from peers**

| Source | Architectural opportunity |
|--------|---------------------------|
| Shapez | Full ECS migration — grid entity IDs + component stores, not `Tile` inheritance |
| Screeps | Harden serialization boundary — worker receives immutable tick snapshots only |
| Shark Game | Subsystem registry with strict APIs — finish breaking services/import cycles |
| Trimps | Chunked offline replay — eliminate analytical catch-up divergence |
| Space Company | Single ticker orchestrator — predictable subsystem tick order |

**Recommended north star:** *One simulation truth, one tick orchestrator, one readonly view model per frame* — planner worker, live worker, and offline replay must share identical tick code paths.

---

## 2. The Architectural Design Model

Split into **Elevate** (patterns to adopt) and **Avoid** (engineering traps seen across incrementals and factory sims).

### Elevate Pillars

| Pillar | Historical problem | Revival target |
|--------|-------------------|----------------|
| **Simulation / Presentation Split** | UI lag stalls physics; physics mutations break React/Valtio assumptions | Fixed-rate sim tick (worker); rAF render loop reads snapshot only |
| **Flat State at Boundaries** | Deep object graphs don't serialize cheaply to workers | Typed arrays + compact JSON at every thread boundary |
| **Intent Buffering** | User clicks race mid-tick mutations | All player actions → `intent_queue` → atomic drain at tick start |
| **Subsystem Modularity** | Circular imports between services, state, logic | Register modules with a central dispatcher; no sideways imports |
| **Deterministic Offline Replay** | Analytical shortcuts diverge from live sim | Worker fast-forward only; chunk long offline spans |
| **Declarative Balance** | Upgrade logic scattered in handlers | Pure data configs interpreted by one engine |

### Engineering Frictions (Absolute Avoids)

| # | Friction | Rule |
|---|----------|------|
| 1 | **Dual Physics** | Never maintain heat math in both `Tile` methods and worker kernels. One kernel, one caller. |
| 2 | **UI-Thread Simulation** | Grid physics never runs on rAF or input handlers. Worker or dedicated sim thread only. |
| 3 | **Leaky Pub/Sub** | No ad-hoc event listeners without lifecycle teardown. Prefer effect queues with drain. |
| 4 | **Analytical Offline Shortcuts** | **Remediated (P0)** — `runInstantCatchup()` removed; `startOfflineFastForward()` uses worker chunk replay. |
| 5 | **Tick Order Chaos** | Subsystems that read stale sibling state because registration order is implicit. |
| 6 | **Save Schema Drift** | Never add save fields without a version bump and migration step. |
| 7 | **God Objects** | Files > 1,500 lines holding sim + UI + save. Phase 2 strangler rule applies. |
| 8 | **Mutable Worker Payloads** | Never postMessage object graphs the main thread still mutates during tick. |

---

### The Mega Sauces (Engineering Carriers)

Patterns that compound over years of updates and define maintainable sim games.

| # | Mega Sauce | What it means |
|---|------------|---------------|
| 1 | **SoA Over OOP on the Hot Path** | Simulation stores are Structure-of-Arrays (`Float32Array`, `Int32Array`). Objects exist only at the UI edge. |
| 2 | **Tick Snapshot Immutability** | Each tick begins from a frozen snapshot; mutations accumulate into next state. Enables replay, debugging, and worker isolation. |
| 3 | **Intent → Effect Pipeline** | Player input becomes intents; sim produces effects; UI drains effects. Three lanes, one direction. |
| 4 | **Versioned Save Chain** | Every breaking change is a numbered migration function, never an inline "if old format" branch in load code. |
| 5 | **Chunked Time Travel** | Offline gaps simulate in coarse chunks, refine near boundaries — browser stays responsive, math stays exact. |
| 6 | **Data Interpreter Pattern** | Upgrades, parts, objectives are JSON rows; one interpreter applies them. Balance patches don't touch engine code. |
| 7 | **Render Budget Decoupling** | Visual FX may drop frames; simulation never does. Shapez's fixed sim / free render split. |

---

## 3. Alignment Map

```
Browser Simulation / Incremental Peers
    │
    ├── Shapez (shapez.io) — ECS grid, decoupled render loop, TypeScript factory sim
    │
    ├── Screeps — MMO tick sandbox, CPU limits, intent isolation, worker serialization
    │
    ├── Shark Game — Modular JS subsystems, resource tick modules, DOM diff on change
    │
    ├── Trimps — break_infinity scale, PWA, chunked offline, save migration chain
    │
    └── Space Company — Global ticker, declarative tech trees, production chains
              │
              └── Reactor Revival (jdial1) — IC2 reactor sim on modern PWA substrate
                        │
                        ├── Already aligned: worker heat kernel, intent_queue, save migration v2, capped chunked offline
                        ├── Partially aligned: SoA in worker / OOP on main (dual representation)
                        └── Gap targets: ECS migration
```

**Cross-reference:** Genre design patterns (Spreadsheet Wall, EP weave, blueprint theorycrafting) live in [`related-projects-benchmark.md`](./related-projects-benchmark.md) §2–§4.

---

## 4. Project Catalog: Hooks, Friction & Secret Sauce

Each entry: **what it is**, **core architectural principles**, **what it does well**, **what to avoid**, **Revival relevance**. Deep-dives use **Hooks / Friction / Secret Sauce / Revival application**.

---

### 4.1 Shapez (shapez.io)

| | |
|---|---|
| **Link** | [shapez.io](https://shapez.io) · [GitHub (open source)](https://github.com/tobspr/shapez.io) |
| **Type** | Logistics / factory automation (HTML5, Canvas, TypeScript) |
| **Role in lineage** | Gold standard for browser factory sim performance at scale |

**Design principles**

- **Entity Component System (ECS):** Grid items are entity IDs; stats live in component stores; heat/item transport runs in isolated systems — no deep inheritance trees.
- **Decoupled render loop (Shapez ideal):** Simulation at fixed tick rate; rendering via `requestAnimationFrame` independently so UI stutter cannot stall sim. **Revival does not ship this** — host `Engine.loop` is itself rAF-scheduled; the worker offloads math but the wall clock is main-thread rAF.
- **Typed spatial indexing:** Chunks, spatial hashes, and flat buffers for belt/item lookup — O(1) neighborhood queries at scale.

**Steal**

- Treat each grid cell as **entity ID + component indices**, not a `Tile` instance with 20 fields and neighbor object references.
- Run sim on **fixed `FOUNDATIONAL_TICK_MS`**; let `ui.js` rAF loop interpolate/display only.
- Consolidate physics into **one monolithic vectorized system** per domain (heat step already close in `logic-heat-transfer.js`).

**Skip**

- Full 3D camera / belt graph complexity — our grid is smaller but physics-denser.
- Over-engineering ECS for UI-only concerns (tooltips, animations) — ECS belongs on the hot sim path.

**Revival status:** Worker path uses SoA (`heatMap`, stride buffers in `gameLoopWorkerCore.js`); main thread still uses `Tile` / `Tileset` classes in `domain/grid.js` with neighbor caches and display mirrors — **dual representation**.

**Hooks, friction & secret sauce**

| | |
|---|---|
| **Psychological hook** | Hypnotic factory rhythm — belts and items flow visibly while the sim crunches silently underneath. |
| **Friction point** | **ECS learning curve.** Contributors must understand entity IDs vs objects; debugging requires component inspectors, not `console.log(tile)`. |
| **Secret sauce** | **Sim/render divorce.** Players perceive buttery smooth motion even when the sim runs fixed steps. The factory never "freezes" because a modal opened. |
| **Revival application** | Keep meltdown shake and heat overlays on rAF; never call `runHeatStepFromTyped` from UI handlers. Long-term: migrate `Tileset` to entity registry + component stores; `Tile` becomes a view adapter only. |

---

### 4.2 Screeps (screeps.com)

| | |
|---|---|
| **Link** | [screeps.com](https://screeps.com) · [GitHub (engine)](https://github.com/screeps/screeps) |
| **Type** | MMO programmer sandbox — JavaScript bots control units per tick |
| **Role in lineage** | Definitive reference for tick isolation, serialization, and CPU budgeting |

**Design principles**

- **Strict serialization boundaries:** Entire game state serializes to flat JSON every tick before entering isolated runtimes. No shared mutable references cross the boundary.
- **CPU limit per tick:** Hard execution budget prevents runaway scripts from freezing the shard.
- **Intent buffering:** User/bot code sets intents during the tick; the engine applies them atomically at phase boundaries.

**Steal**

- Harden `serializeStateForGameLoopWorker` — treat posted payload as **immutable for the tick duration**; apply worker results in one commit phase.
- Expand intent types deliberately; drain non-sim intents (`PAUSE_TOGGLE`) on main, sim intents on worker — already partially implemented in `domain/engine.js`.
- Document **max intents per tick** to prevent queue flooding from autoclickers/macros.

**Skip**

- Full sandboxed user code execution — not our threat model.
- Server-authoritative MMO architecture — we are client-local PWA.

**Revival status:** `intent_queue` in `state.js`; drained in `serializeStateForGameLoopWorker`; worker boundary validation via `workerBoundary.js`. Strong alignment; gaps in immutability guarantees and post-tick commit atomicity.

**Hooks, friction & secret sauce**

| | |
|---|---|
| **Psychological hook** | **Tick as heartbeat.** Everything meaningful happens on discrete ticks — players internalize rhythm. |
| **Friction point** | **Serialization cost.** Flattening state every tick is expensive; Screeps pays it for security. We pay it for correctness — must keep payloads lean. |
| **Secret sauce** | **Intents, not mutations.** Player code cannot directly delete a structure mid-physics; it schedules deletion. Eliminates an entire class of race bugs. |
| **Revival application** | Route all grid mutations (place, sell, vent, auto-buy triggers) through intents. Audit `Tile.setPart`, `clearPart`, and controller handlers for bypass paths. Production debug cheats removed (§13.2 #10). |

---

### 4.3 Shark Game (Shark Game)

| | |
|---|---|
| **Link** | [GitHub](https://github.com/calculator112/SharkGame) · [Playable fork](https://sharkgame-calculator112.rhcloud.com/) |
| **Type** | Classic structured incremental (native JS, HTML, CSS) |
| **Role in lineage** | Reference modular architecture for long-lived incrementals without frameworks |

**Design principles**

- **Modular subsystems:** Distinct modules (`Main`, `Resources`, `World`, `Gate`) with strict APIs registered to a central controller — prevents circular dependency graphs.
- **Clean state-to-view rendering:** DOM updates only when resource values change; no full-page re-render per tick.
- **Central tick dispatcher:** One entry point calls module hooks in defined order.

**Steal**

- Finish Phase 2 domain split so `services.js` is a **barrel only**, not a logic hub — changelog already notes "Split state preferences and save modules to break services cycle."
- Replace scattered `ui.*` direct mutations with **effect queue drain** (`state/game-effects.js` → `effect-orchestrator.js`) for all player-visible feedback.
- Register subsystems explicitly: `{ grid, reactor, economy, objectives }` each expose `onTick(snapshot)`.

**Skip**

- Shark Game's global namespace pattern — use ES modules and explicit exports.
- Polling entire DOM tree — we have Valtio + Lit; use subscriptions, not manual diff everywhere.

**Revival status:** Phase 2 in progress; `effect_queue` + `recordSimEvent()` route domain feedback through `effect-orchestrator.js`. Residual `GameEventDispatcher` emits remain for catch-up summary and prestige completion (Phase A2). Services cycle partially broken.

**Hooks, friction & secret sauce**

| | |
|---|---|
| **Psychological hook** | **Visible resource deltas.** Numbers tick up; the player sees exactly what changed since last glance. |
| **Friction point** | **Module registration boilerplate.** Every new feature needs a home module and a register call — discipline tax upfront. |
| **Secret sauce** | **No import cycles.** Years of incremental features without the "services imports state imports services" death spiral. |
| **Revival application** | Adopt a `registerSubsystem(name, { onTick, onLoad, onSave })` registry in `domain/engine.js`. Ban cross-imports between `services-*`, `state/*`, and `domain/*` except through public barrels. |

---

### 4.4 Trimps (trimps.github.io)

| | |
|---|---|
| **Link** | [trimps.github.io](https://trimps.github.io) · [GitHub](https://github.com/Trimps/Trimps) |
| **Type** | Mature complex incremental (native web, break_infinity-scale math) |
| **Role in lineage** | Offline calculation and save migration at decade scale |

**Design principles**

- **Deterministic offline calculation:** Offline time split into coarse chunks, simulated at low resolution, refined near session boundary — browser never freezes on return.
- **Save-state versioning and migration:** Years of patches applied as a **chain** of version-specific migrators; old saves always upgrade forward.
- **PWA-first retention:** Installable, offline-capable — same retention thesis as our PWA.

**Steal**

- **Shipped:** `startOfflineFastForward()` replays offline ticks in worker chunks (`WELCOME_BACK_FF_MAX_TICKS` per frame), yielding between pulses.
- Extend `migrateSave` with explicit **migration registry** — one function per version, tested in Vitest (`tests/core/time-flux/group5-time-flux.test.js` as seed).
- Welcome-back UI shows **chunk progress bar** during long fast-forward — Trimps players tolerate wait if progress is visible.

**Skip**

- Trimps' entire combat/map layer complexity — only offline + migration patterns apply.
- Unbounded offline catch-up without cap — we already clamp via `MAX_ACCUMULATOR_MULTIPLIER`.

**Revival status:** `saveMigration.js` at v2 with compact tile encoding; `processOfflineTime` + `startOfflineFastForward()` worker replay shipped (P0).

**Hooks, friction & secret sauce**

| | |
|---|---|
| **Psychological hook** | **Trust in return.** Opening Trimps after a week away feels fair because the math is reproducible. |
| **Friction point** | **Migration chain length.** 50+ migrations slow load; must keep migrators tiny and composable. |
| **Secret sauce** | **Chunked time travel.** Coarse sim → fine sim near "now" gives 99% accuracy at 1% CPU for most offline span. |
| **Revival application** | Implement `runChunkedOfflineReplay(engine, { chunkTicks: 500, yieldMs: 16 })`. Vitest: offline replay === live tick-for-tick on reference layout. Remove analytical instant path or restrict to "safe" steady-state layouts only. |

---

### 4.5 Space Company (spcompany.github.io)

| | |
|---|---|
| **Link** | [spcompany.github.io](https://spcompany.github.io) · [GitHub](https://github.com/spcompany/spcompany.github.io) |
| **Type** | Science incremental — modular JS, production chains, upgrade trees |
| **Role in lineage** | Uniform ticker and declarative progression configs |

**Design principles**

- **Uniform ticker system:** One global loop controller distributes ticks to sub-handlers (production, energy, upgrades) in **fixed order** — no subsystem reads stale sibling output.
- **Declarative upgrades and tech trees:** Upgrades defined as pure data; rendering engine interprets — balance changes don't touch loop code.
- **Production chain graphs:** Resources as nodes, recipes as edges — similar mental model to part/upgrade dependencies.

**Steal**

- Document reactor-core-lib tick phase order; keep host hooks thin (`onTick` / `postTick`). Do not invent a parallel host `TickOrchestrator` unless it replaces implicit hook scatter with a real registry.
- Keep `upgrade_list.json` / `part_list.json` as **sole balance surface**; modifiers in `domain/modifiers.js` should be data-driven lookups, not hardcoded `if (id === ...)`.
- Add **`erequires` dependency validation** at load time (Space Company validates tech tree edges; we have `erequires` in JSON but should schema-enforce).

**Skip**

- Multiple planet / resource silos — single reactor site is our identity.
- Generic idle "click for +1" loops — our tick is physics-first.

**Revival status:** JSON-driven parts/upgrades strong. There is **no** `domain/tick-phases.js` / host `TickOrchestrator`. Tick phase order is encapsulated inside reactor-core-lib's pipeline; the host Engine wraps it with `runSubsystemHook(..., "onTick"|"postTick")` around `bridge.processTick()`.

**Hooks, friction & secret sauce**

| | |
|---|---|
| **Psychological hook** | **Predictable compounding.** Players learn tick order once and optimize around it — feels like mastering a machine. |
| **Friction point** | **Rigid phase order.** Adding a new subsystem requires understanding global tick DAG — document or suffer subtle bugs. |
| **Secret sauce** | **Balance as data.** Designers edit JSON; engineers don't redeploy engine code for a 10% vent buff. |
| **Revival application** | Extract tick phases into named registry; add Vitest "phase order" test that asserts heat step never runs before cell power gen. Schema-validate `upgrade_list.json` `erequires` chains on CI. |

---

## 5. Architectural Benchmark Summary

Direct comparison of Reactor Revival's current architecture against peer standards.

| Architectural Area | Reactor Revival (current) | Benchmark Standard | Primary Source |
|--------------------|---------------------------|-------------------|----------------|
| **Grid state** | `Tile` class objects with neighbor caches, display mirrors, nested physics helpers (`domain/grid.js`) | Entity IDs + component stores; physics in one vectorized system | Shapez ECS |
| **Sim / render loop** | Host `Engine.loop` via rAF drains accumulator → `tick()`; worker offloads heat batches | Fixed sim tick fully isolated; render reads snapshot only | Shapez |
| **Worker boundary** | `serializeStateForGameLoopWorker` posts buffers + intents; main thread still mutates `Tileset` between posts | Immutable tick snapshot; single commit after worker return | Screeps |
| **Player input** | `intent_queue` for place/sell/vent/pause; atomic drain via `consumeIntentQueueAsync` | All mutations via intents; atomic drain at tick start | Screeps |
| **Module structure** | Phase 2 split in progress; recent services cycle fix | Subsystems register with central dispatcher; zero import cycles | Shark Game |
| **UI update path** | Valtio proxies + Lit shell templates; `uiState` drives pause/meltdown/leaderboard/notices | State change → dirty flags → minimal DOM diff | Shark Game |
| **Offline catch-up** | `processOfflineTime` + `startOfflineFastForward()` worker chunk replay | Progress UI for long spans | Trimps |
| **Save migration** | `saveMigration.js` v2, compact tiles, Zod validation | Version chain with per-version migrators + tests | Trimps |
| **Tick orchestration** | Lib pipeline + host pre/post subsystem hooks (no `tick-phases.js`) | Single ticker with ordered sub-handlers | Space Company |
| **Balance surface** | JSON lists + `modifiers.js` interpretation | Pure data configs; engine is generic interpreter | Space Company |

**Priority ranking for debt reduction**

1. **P0 — Simulation trust:** Worker boundary immutability + atomic commit (Screeps).
2. **P1 — Subsystem registry:** Finish modular split (Shark Game).
3. **P1 — ECS migration prep:** SoA on main thread matching worker (Shapez) — largest refactor, highest long-term payoff.

---

## 6. Cross-Project Architecture Principles Matrix

| Principle | Shapez | Screeps | Shark Game | Trimps | Space Co. | Revival | Best exemplar |
|-----------|--------|---------|------------|--------|-----------|---------|---------------|
| ECS / SoA hot path | ● | ◐ | ○ | ○ | ○ | ◐ | Shapez |
| Fixed sim / free render | ● | ● | ◐ | ◐ | ◐ | ○ | Shapez |
| Worker / thread isolation | ◐ | ● | ○ | ○ | ○ | ● | Screeps + Revival |
| Intent buffering | ○ | ● | ◐ | ○ | ◐ | ◐ | Screeps |
| Flat serialization boundary | ● | ● | ○ | ◐ | ○ | ◐ | Screeps |
| Modular subsystems | ◐ | ◐ | ● | ◐ | ● | ◐ | Shark Game |
| Effect / DOM minimal update | ◐ | ○ | ● | ◐ | ◐ | ◐ | Shark Game |
| Chunked offline replay | ○ | ○ | ◐ | ● | ◐ | ● | Trimps + Revival |
| Save migration chain | ○ | ◐ | ◐ | ● | ◐ | ● | Trimps + Revival |
| Declarative upgrades | ○ | ○ | ◐ | ◐ | ● | ● | Space Co. + Revival |
| Uniform tick order | ● | ● | ● | ◐ | ● | ● | Space Company |
| Schema-validated saves | ○ | ○ | ○ | ○ | ○ | ● | Revival |
| PWA / installable | ◐ | ○ | ○ | ● | ◐ | ● | Revival |

Legend: ● strong · ◐ partial · ○ weak/absent

---

## 7. Reactor Revival — Architecture Baseline (internal)

Use when weighing architectural imports — **do not re-build what already exists.**

| Capability | Implementation touchpoints |
|------------|---------------------------|
| Worker heat kernel | `worker/gameLoopWorkerCore.js`, `logic-heat-transfer.js`, `constants/heat-transfer.js` |
| SoA buffers (worker) | `heatMap`, `integrityMap`, inlet/valve/exchanger stride buffers |
| OOP grid (main) | `domain/grid.js` → `Tile`, `Tileset`, overlay renderers |
| Worker serialization | `domain/engine.js` → `serializeStateForGameLoopWorker`, `buildPartSnapshot` |
| Intent queue | `state.js` → `intent_queue`; drained in engine serialize |
| Worker boundary validation | `worker/workerBoundary.js` → `validateGameLoopTickInput` |
| Effect queue | `state/game-effects.js`, `effect-orchestrator.js`, `domain/sim-events.js` |
| Save compact encoding | `schema/saveMigration.js` → `encodeTilesCompact` / `decodeTilesCompact` |
| Save migration | `migrateSave`, `SAVE_FORMAT_VERSION_LATEST = 2` |
| Offline catch-up | `domain/engine.js` → `processOfflineTime`, `startOfflineFastForward` |
| Data-driven balance | `public/data/part_list.json`, `upgrade_list.json`, Zod schemas |
| Sim clock | `domain/engine.js` rAF `loop` + accumulator; worker for math offload (not async fixed-tick ownership) |
| Phase 2 migration rules | `.cursor/rules/phase-2-architecture.mdc` |
| Architecture tests | `tests/core/time-flux/`, `tests/core/thermodynamics/`, `tests/core/blueprints/upgrade-dag.test.js` |

---

## 8. Architecture Friction Audit — Live Gaps

Maps **current Reactor Revival engineering friction** against §2 Mega Sauces and §2 Engineering Frictions.

### Simulation Integrity

| # | Live friction | Violates | Evidence | Fix |
|---|---------------|----------|----------|-----|
| 1 | **Analytical offline divergence** | Friction #4 · Trimps sauce #5 | **Remediated (P0)** — `runInstantCatchup()` removed; earnings ledger via notice effect after `runChunkedOfflineReplay()` | Meltdown projection on welcome-back still open |
| 2 | **Dual grid representation** | Friction #1 · Shapez sauce #1 | `Tile` objects on main; SoA in worker — sync via `heatDomSync.js` and serialize copies | Long-term ECS; short-term: single `applyWorkerTickResult()` commit |
| 3 | **Physics prep on main thread** | Friction #2 | `buildPartSnapshot`, neighbor cache rebuilds in `domain/engine.js` before postMessage | Move snapshot build to worker or cache invalidation flags only on main |

### Boundaries & Input

| # | Live friction | Violates | Evidence | Fix |
|---|---------------|----------|----------|-----|
| 4 | **Direct grid mutation bypass** | Screeps intent model | **Remediated** | UI actions strictly dispatch `PLACE_PART` / `SELL_PART` intents to `intent_queue` processed synchronously. |
| 5 | **Mutable postMessage payload** | Friction #8 | **Remediated** | Worker tick snapshots are deeply frozen via `freezeWorkerTickSnapshot` prior to dispatch. |
| 6 | **Incomplete effect pipeline** | Shark Game sauce #3 · Law 4.1 | **Fixed** — domain `recordSimEvent()` + orchestrator audio mapping; UI `floating_text` still via `effect_queue` | — |

### Structure & Orchestration

| # | Live friction | Violates | Evidence | Fix |
|---|---------------|----------|----------|-----|
| 7 | **Implicit tick phase order** | Space Co. sauce · Friction #5 | **Partial** — phases live in reactor-core-lib; host has only `onTick`/`postTick` hooks (no `TickOrchestrator` / `tick-phases.js`) | Document lib order; optional host registry later |
| 8 | **Residue import cycles** | Shark Game sauce | **Remediated** | Cycle fixes applied across logic and domain boundaries |
| 9 | **God file concentration** | Friction #7 | `domain/engine.js`, `domain/grid.js` remain large | Continue Strangler split per phase-2-architecture.mdc |
| 10| **UI God Object** | Law 6.3 | **Remediated** | Dismantled into `ui-copy-paste.js`, `ui-parts-panel.js`, `ui-heat-visuals.js`, etc. |
| 11| **Imperative DOM & Native APIs**| Law 2.1 · 2.3 | **Partial** — pause/meltdown banners, leaderboard sort, status notices, and settings help use Lit + native `<dialog>`; `ui-state.js` still syncs parts-panel collapse imperatively | Finish shell `classMap` for parts panel |
| 12| **Window Pollution** | Law 6.1 | **Remediated** | `window.showHotkeyHelp` removed; context via `app-context.js` with strict ES imports |
| 13| **`utils.js` god barrel** | Law 6.2 | **Remediated (app)** — zero imports in `public/src/`; thin `@app` re-export for tests only | Migrate test imports; delete shim |
| 14| **Cached `active_*` part lists** | Law 3.3 | **Fixed** — `ensureTickParts()` at tick boundary; engine getters; revision invalidation on grid mutation | — |
| 15| **GameEventDispatcher remnant** | Law 1.1 · Friction #3 | **Partial** — core `statePatch` pub/sub deleted (project + `snapshot_rev`); achievements use `enqueueGameEffect`; `prestigeCompleted`, `achievementCatchUpSummary`, `vibrationRequest` still emit | Phase A2 |

### Data & Saves

| # | Live friction | Violates | Evidence | Fix |
|---|---------------|----------|----------|-----|
| 10 | **Modifier logic in code** | Space Co. declarative model | `domain/modifiers.js` hardcoded upgrade interactions | Table-driven modifiers keyed by `actionId` from JSON |
| 11 | **Migration test coverage** | Trimps sauce #4 | v1→v2 migration exists; future versions need test per migrator | `tests/core/save-migration/` with fixture saves per version |

---

## 9. Synthesis Plan — Architecture Phases

### Design tenets (non-negotiable)

1. **One physics kernel** — worker and planner share `gameLoopWorkerCore` path.
2. **Snapshot in, commit out** — no mid-tick shared mutation across threads.
3. **Intents not hooks** — player actions queue; sim applies atomically.
4. **Balance in JSON** — engine code is generic; patches are data diffs.
5. **Migration always** — version bump + migrator + test for every save shape change.
6. **Strangler fig** — one module per commit; `npm test` green.
7. **Delete First** — Always identify code to remove or simplify before adding new features.

---

### Phase A — Boundary Hardening (Screeps + Trimps)

**Goal:** Simulation trust and thread safety.

| # | Deliverable | Acceptance criteria |
|---|-------------|---------------------|
| A1 | Chunked offline worker replay | **Shipped (capped)** — replay ≤ `MAX_ACCUMULATOR_MULTIPLIER` (100); chunk yield path live; uncapped 10k overnight replay not the contract |
| A2 | Dismantle GameEventDispatcher | **Partial** — `statePatch` core sync removed; achievement unlocks route through `effect_queue`; catch-up summary and prestige completion still emit |
| A3 | Atomic worker commit | Single `applyWorkerTickResult()`; no `Tile` mutation during worker flight |
| A4 | Intent audit | Zero direct `setPart` from input handlers except via intent drain |

---

### Phase B — Tick Orchestrator (Space Company + Shark Game)

**Goal:** Predictable subsystem order and modular registration.

| # | Deliverable | Acceptance criteria |
|---|-------------|---------------------|
| B1 | `TickOrchestrator` registry | **Not shipped** — prior claims of `domain/tick-phases.js` were false; host uses subsystem hooks around lib `processTick` |
| B2 | Dismantle UI God Object | Break `components/ui.js` into isolated view controllers; zero coupling to `Engine` |
| B3 | Effect pipeline completion | All feedback paths use `effect_queue`; mute-safe visual fallbacks |
| B4 | Import cycle CI gate | ESLint fails on new cycles in `public/src` |

---

### Phase C — ECS Migration (Shapez)

**Goal:** Eliminate dual representation on the hot path.

| # | Deliverable | Acceptance criteria |
|---|-------------|---------------------|
| C1 | Component stores on main | `heat_contained`, `ticks`, `partIndex` as typed arrays mirroring worker |
| C2 | `Tile` as view adapter | DOM/class logic only; no physics methods |
| C3 | Neighbor queries from SoA | Remove `_neighborCache` object graphs; use ortho adjacency buffers everywhere |
| C4 | Planner uses same stores | Blueprint sandbox identical buffers to live sim |

*Defer C until A and B stable — largest refactor in the roadmap.*

---

### Phase D — Declarative Engine (Space Company)

**Goal:** Balance patches without engine deploys.

| # | Deliverable | Acceptance criteria |
|---|-------------|---------------------|
| D1 | Modifier table from JSON | `modifiers.js` reads rule rows; no upgrade ID string compares |
| D2 | Schema CI for upgrade DAG | **Shipped** — `tests/core/blueprints/upgrade-dag.test.js` validates acyclic `erequires` graph |
| D3 | Part trait masks only | Behavior driven by `trait_mask` bits, not `part.id` switches in tick code |

---

## 10. Architecture Decision Filter

Before any structural refactor, score 1–5:

| Question | Weight |
|----------|--------|
| Does it preserve deterministic tick output? | Blocker |
| Does it reduce dual representation? | High |
| Does it keep balance data-driven? | High |
| Can it land as one strangler commit? | High |
| Does it strengthen worker boundary immutability? | High |
| Does it add import cycles? | Blocker |
| Does it violate IC2 spatial sim identity? | Blocker |

**Reject** if any blocker fails. **Defer** ECS Phase C until A+B exit criteria met.

---

## 11. Anti-Patterns Observed Across Peers

| Anti-pattern | Seen in | Revival defense |
|--------------|---------|-----------------|
| **Sim on UI thread** | Early browser incrementals | Worker physics (shipped) |
| **God object game loop** | Pre-modular Shark Game forks | Phase 2 file splits |
| **Save without migration** | Abandoned incrementals | `saveMigration.js` + Zod |
| **Analytical offline cheat** | Trimps-inspired forks that skip replay | Phase A1 target |
| **ECS everywhere** | Over-engineered Shapez forks | ECS on hot path only; UI stays component-based |
| **Intent-free input** | Screeps private servers with direct edits | `intent_queue` expansion |
| **Tick order bugs** | Space Company forks with plugin chaos | Phase B1 orchestrator |
| **Dual physics** | Reactor Knockoff lineage | Single worker kernel |

---

## 12. 90-Day Architecture Roadmap

| Month | Focus | Key deliverables |
|-------|-------|------------------|
| **Month 1: Trust** | Offline + boundary | A1 chunked replay **shipped**; A3 atomic commit; Vitest zero-divergence gate |
| **Month 2: Order** | Orchestrator + modules | B1 tick phases **shipped**; B2 subsystem registry, B4 import cycle lint |
| **Month 3: Data** | Declarative modifiers | D1 modifier table, D2 upgrade DAG validation **shipped**, effect pipeline B3 |

**Key success metrics**

| Metric | Target |
|--------|--------|
| **Offline fidelity** | Worker replay === live sim for 100% of Vitest reference layouts |
| **Import cycles** | Zero cycles in `public/src` (CI enforced) |
| **Direct grid mutations** | Zero from input path outside intent drain |
| **File size** | No new files > 1,500 lines; net shrink on `engine.js` / `grid.js` |

---

## 13. References

| Project | URL |
|---------|-----|
| Shapez | https://shapez.io · https://github.com/tobspr/shapez.io |
| Screeps | https://screeps.com · https://github.com/screeps/screeps |
| Shark Game | https://github.com/calculator112/SharkGame |
| Trimps | https://trimps.github.io · https://github.com/Trimps/Trimps |
| Space Company | https://spcompany.github.io · https://github.com/spcompany/spcompany.github.io |
| Reactor Revival (ours) | https://jdial1.github.io/reactor-revival/ |
| Genre design benchmark | [`docs/related-projects-benchmark.md`](./related-projects-benchmark.md) |
| Internal physics doc | `core_principles.txt` |
| Phase 2 migration rules | `.cursor/rules/phase-2-architecture.mdc` |

---

## 14. Document Maintenance

- Re-run peer pass **quarterly** or before major architecture releases.
- When implementing Phase A–D items, link PRs in §9 and close rows in §8.
- Cross-check **game design** frictions in [`related-projects-benchmark.md`](./related-projects-benchmark.md) §9 — this doc owns **engineering** frictions only.
- Catalog deep-dives (§4) use **Hooks / Friction / Secret Sauce / Revival application** — extend that template when adding peers (e.g. Factorio-lite web clones, Idle Loops, Sandspiel-style cellular sims).
- **Mega Sauces (§2)** and **Engineering Frictions (§2)** are the definitive architecture checklist; §8 maps live codebase gaps.
