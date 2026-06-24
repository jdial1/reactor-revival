# Reactor Revival — Design Foundations (Source of Truth)

> **Purpose:** Single canonical reference for *how Reactor Revival is built*. Each system component has **one chosen pattern** and **one primary exemplar**. We do not re-implement the same concern seven ways — we pick the best design per component and ship toward it.
>
> **Audience:** Anyone making feature, balance, UX, or architecture decisions.
>
> **Deep catalogs (reference only):**
> - [`related-projects-benchmark.md`](./related-projects-benchmark.md) — reactor lineage game design, friction audits, genre gaps
> - [`incremental-sim-architecture-benchmark.md`](./incremental-sim-architecture-benchmark.md) — engineering peers (Shapez, Screeps, etc.), architecture phases
>
> **Physics & math authority:** `core_principles.txt`
>
> **Last updated:** 2026-06-24 (§3 Status + §8 gaps validated against live `public/src/`)

---

## 1. North Star

**Identity:** The most trustworthy browser IC2-style reactor simulator — spatial adjacency puzzle, deterministic pulse physics, industrial operator fantasy.

**Product promise:** In-engine theorycrafting, deterministic simulation trust, and progression that graduates the player from manual operator to systems architect — without wiki dependency or external spreadsheets.

**Engineering promise:** One physics kernel, one tick orchestrator, one readonly view model per frame. Live sim, blueprint sandbox, and offline replay share the same worker path.

**When in doubt:** Preserve deterministic ticks, spatial adjacency, and in-engine teachability. Reject generic idle tropes that bypass the grid.

---

## 2. How to Use This Document

| Question | Go to |
|----------|-------|
| "What pattern do we use for X?" | §3 Canonical Component Map |
| "Is this idea allowed?" | §4 Non-Negotiables + §5 Hard Rejects |
| "Where does X live in code?" | §6 Implementation Index |
| "Should we build this feature?" | §7 Decision Gate |
| "What's still wrong in live code?" | §8 Known Gaps (rollup) |
| "What colors, fonts, or heat visuals do we use?" | [`thematic-styling.md`](./thematic-styling.md) |
| "Why did we pick MauveCloud over RI for planners?" | This doc §3 — benchmarks are evidence, not authority |

**Rule:** If a PR introduces a second pattern for a component that already has a canonical row in §3, the PR must either (a) replace the old pattern, or (b) document an explicit exception in the PR with identity justification.

---

## 3. Canonical Component Map

One row per component. **Source** = primary exemplar we adopt. **Revival rule** = what we actually build. **Status** = shipped / partial / target.

### 3.1 Simulation & Engine

| Component | Source | Revival rule | Status | Touchpoints |
|-----------|--------|--------------|--------|-------------|
| **Pulse & heat physics** | **Revival** (`core_principles.txt`) | Power ∝ (M+N); heat ∝ (M+N)²; pressure-gradient batch heat step; no RNG in core sim | ● Shipped | `logic.js`, `logic-heat-transfer.js`, `gameLoopWorkerCore.js` |
| **Physics kernel** | **Revival** | Single worker kernel — planner, live, and offline replay call the same code path | ● Shipped | Worker kernel; offline via `startOfflineFastForward()` chunked replay |
| **Grid state (hot path)** | **Shapez** | Entity ID + SoA component stores (`Float32Array`, `Int32Array`); objects only at UI edge | ◐ Partial | Worker SoA shipped; main thread still `Tile` class in `domain/grid.js` |
| **Sim / render split** | **Shapez** | Fixed `FOUNDATIONAL_TICK_MS` sim; `requestAnimationFrame` for display/FX only | ◐ Partial | Worker + `ui.js` rAF; some snapshot prep on main |
| **Tick orchestration** | **Space Company** | One global tick controller; named phases in fixed order | ● Shipped | Explicit `TickOrchestrator` with named phases in `domain/tick-phases.js` |
| **Worker boundary** | **Screeps** | Immutable tick snapshot in; atomic commit out; no mid-tick shared mutation | ◐ Partial | `serializeStateForGameLoopWorker`, `workerBoundary.js` |
| **Player input** | **Screeps** | All sim-affecting actions → `intent_queue` → drain at tick start | ● Shipped | `PLACE_PART`, `SELL_PART`, `APPLY_BLUEPRINT` via `drainGridIntents*` in `domain/engine.js` |
| **Offline catch-up** | **Trimps** | Chunked worker replay only; yield to UI between chunks; no analytical stat multiply | ● Shipped | `startOfflineFastForward()` + `WELCOME_BACK_FF_MAX_TICKS`; analytical `runInstantCatchup()` removed |
| **Compiled adjacency** | **Revival** | Pre-built ortho/topology maps; O(1) neighbor lookup per tick | ● Shipped | `logic-topology.js`, `soaTickLayout.js` |

### 3.2 State, Saves & Data

| Component | Source | Revival rule | Status | Touchpoints |
|-----------|--------|--------------|--------|-------------|
| **Save validation** | **Revival** | Zod schema on load/save; reject invalid blobs | ● Shipped | `SaveDataSchema`, `stateSchemas.js` |
| **Save migration** | **Trimps** | Version chain; one migrator per version; test fixture per step | ◐ Partial | `saveMigration.js` v2; expand test coverage |
| **Compact grid encoding** | **Revival** | `u16_f32f32` tile blobs in save payload | ● Shipped | `encodeTilesCompact` / `decodeTilesCompact` |
| **Parts & upgrades** | **Space Company** + **IC2** | Pure JSON rows; engine interprets via `trait_mask` and `actionId` — not hardcoded upgrade IDs in tick code | ● Shipped | `modifiers.js` loops unlocked upgrades via `actionId` → `MODIFIER_APPLIERS` |
| **Objectives & chapters** | **Revival** | Data-driven checks; state-based (not missable events); teach mechanics in phases | ● Shipped | `objective_list.json`, `objective-controller.js` |
| **Difficulty curves** | **Revival** | Preset curves at new game; smooth EP cliff vs RI wiki wall | ● Shipped | `difficulty_curves.json` |

### 3.3 Architecture & Code Organization

| Component | Source | Revival rule | Status | Touchpoints |
|-----------|--------|--------------|--------|-------------|
| **Module boundaries** | **Shark Game** | Subsystems register with central dispatcher; no import cycles | ◐ Partial | Phase 2 split; services cycle recently broken |
| **UI feedback path** | **Shark Game** + **Revival** | Sim produces typed effects; UI drains `effect_queue` — not ad-hoc DOM + SFX only | ● Shipped | `game-effects.js`, `effect-orchestrator.js` |
| **File size / god objects** | **Knockoff** (anti-pattern) | Strangler fig split; no file > 1,500 lines; never big-bang rewrite | ◐ Partial | `.cursor/rules/phase-2-architecture.mdc` |
| **Public barrels** | **Revival** | Stable `@app/logic.js` exports during migration | ● Shipped | `logic.js`, domain barrels; `public/src/` no longer imports `utils.js` |
| **Test gate** | **Revival** | Vitest on physics, saves, offline; CI blocks deploy | ● Shipped | `tests/core/**` |

### 3.4 Game Design & Progression

| Component | Source | Revival rule | Status | Touchpoints |
|-----------|--------|--------------|--------|-------------|
| **Mechanics vocabulary** | **IC2** | Cells, vents, exchangers, reflectors, hull vs component heat; strict component roles | ● Shipped | `part_list.json`, tooltips |
| **Spatial adjacency identity** | **IC2** + **RI** | Grid is the game; upgrades improve topology not global bypass multipliers | ● Shipped | Category-scoped modifiers in `part.js` / `modifiers.js` |
| **Prestige / EP economy** | **RI** | Dual currency; EP from power *and* heat balance (weave); leaderboard = EP | ● Shipped | `domain/game.js`, prestige modal with explicit `WEAVE_QUANTUM` divisor |
| **Progression arc** | **RI** + **Revival** | Manual operator → automation unlocks → systems architect; cascading obsolescence on grid expansion | ◐ Partial | Auto-buy, heat-control, and drag-fill shipped; undo open |
| **Automation rewards** | **RI** | Auto-buy, auto-replace, smart routing unlock via upgrades — not late-game clicking | ◐ Partial | `auto_buy_operator`, `heat_control_operator`; `cell_perpetual` auto-replace only |
| **In-engine theorycrafting** | **MauveCloud** (inside **Revival**) | Risk-free blueprint mode; same worker physics; steady-state after warmup | ● Shipped | Blueprint planner + `requestBlueprintProjectionSample()` (worker N-tick warmup) |
| **Layout analytics export** | **MauveCloud** | CSV/JSON per-tick export from worker sandbox | ● Shipped | `blueprint_planner_export` in `ui-copy-paste.js` |
| **Layout A/B compare** | **MauveCloud** | Side-by-side steady-state delta for two layouts | ● Shipped | `reactor_compare_layouts_btn` and compare modal |
| **Onboarding** | **Revival** (not RI wiki) | Phased objectives + contextual help — never require external wiki for core mechanics | ◐ Partial | Objectives shipped; prestige modal shows `Min(Power, Heat) / WEAVE_QUANTUM` weave math |
| **Achievements** | **Radioactive Idle** | ~30 optional achievements orthogonal to chapter railroad | ◐ Partial | 25 in `achievement_list.json`; pure evaluators in `logic/achievement-checks.js`; unlock toasts via `effect_queue` |
| **Challenge modes** | **Revival** + **RI** | Difficulty presets + curated puzzle layouts — not infinite generic quests | ◐ Partial | Presets shipped; infinite generic quests removed (§13.2 #9) |

### 3.5 UX, Sensory & Community

| Component | Source | Revival rule | Status | Touchpoints |
|-----------|--------|--------------|--------|-------------|
| **Heat visualization** | **Revival** | Heat-flow arrows + heat-map overlays on grid — math visible, not tooltip-only | ● Shipped | `ui-heat-visuals.js`, overlays |
| **Meltdown feedback** | **IC2** + **Navalty** | Phased: 80% warning → 100% shake → 110% CRT tear → meltdown; diegetic industrial tone | ● Shipped | `failure_state` phases; pre-meltdown layout auto-saved to Recovered Blueprint |
| **Macro placement** | **RI** | Row/col fill, area clear, undo — desktop hotkeys + mobile toolbar | ◐ Partial | Hotkeys, mobile drag-to-build, and `macro-toolbar-popover` shipped; undo (`undoHistory`) open. |
| **Blueprint apply** | **Revival** | Diff-based apply; partial afford; deficit toasts — never silent fail or full-grid replacement tax | ● Shipped | `applyBlueprintLayoutDiff` with partial placement and affordance checks |
| **Layout share codes** | **Talonius** / **MauveCloud** | Short versioned URL-safe codec — not verbose JSON paste | ● Shipped | `core/layoutShareCodec.js` (rr1: prefix) |
| **Save portability** | **RI** + **Revival** | Prominent `.reactor` export/import; dedicated auto-save slot | ● Shipped | Settings export/import (`.reactor`); dedicated `AUTOSAVE_SLOT_KEY` protects manual slots |
| **Offline return ("Morning Coffee")** | **Trimps** (math) + **mobile tycoon** (UX framing) | Worker replay + earnings ledger + meltdown projection before fast-forward | ◐ Partial | Fast-Forward via worker; catch-up earnings notice via `effect_queue` after `runChunkedOfflineReplay()`; meltdown projection still open |
| **Tick audio** | **RI** | Rhythmic sim-bound ASMR; klaxons on danger phases | ● Shipped | `services-audio.js`, tick-bound ambience |
| **Surge / milestone VFX** | **Radioactive Idle** | Deterministic celebration on power/EP milestones — not chain-reaction RNG | ● Shipped | `fx-ep`, `fx-power`, `fx-heat` sprites in `ui-heat-visuals.js` |
| **Flavor & narrative** | **Navalty** | Toasts and banners — never modal dialogue walls mid-optimization | ● Shipped | `flavor_text.json`, `failure_flavor.json`, chapter toasts |
| **Changelog / trust** | **Knockoff** | In-app What's New on version bump; public balance data | ● Shipped | `changelog.json`, Settings |
| **Leaderboard** | **RI** | EP score + optional reproducible layout code | ● Shipped | `services-leaderboard.js`, "Load to Grid" fully implemented. |
| **PWA & install** | **Revival** + **Trimps** | Installable, offline-capable, schema-safe updates | ● Shipped | `services-pwa.js`, Workbox |

### 3.6 Explicitly Deferred (Not 1.0)

| Component | Source | Rule | Why deferred |
|-----------|--------|------|--------------|
| **Multi-reactor network** | **Reactor Redux** | Heat pipes / sub-grids gated late-game only | Cognitive overload if early |
| **Facility abstraction** | **Nuclear Power Idle** | Never replace tile grid with building menus | Identity violation |
| **Cloud save backend** | **RI** | Optional encrypted blob — not required for trust | Ship local `.reactor` first |
| **i18n** | **MauveCloud** | String tables when player base justifies | Post-1.0 |
| **City demand scenario** | **Navalty** | Optional timed quota challenge | P2 content |

---

## 4. Non-Negotiables

Consolidated from both benchmarks. **Blockers** — no PR ships without compliance or explicit documented exception.

### Product

1. **Deterministic simulation** — every core tick output is calculable; no RNG in physics.
2. **Grid identity** — spatial adjacency is the puzzle; no facility-menu abstraction.
3. **In-engine teachability** — no mechanic that forces wiki/Google for basic progress (EP weave, valves, pressure gradients).
4. **Planner parity** — if it works live, blueprint sandbox can simulate it with the same worker kernel.
5. **Data over code** — parts, upgrades, objectives, flavor in JSON + schema validation.
6. **Anti–Spreadsheet Wall** — theorycrafting, analytics, and onboarding live inside the game.

### Engineering

7. **One physics kernel** — no duplicate heat math on UI thread and worker.
8. **Snapshot in, commit out** — worker gets frozen tick state; one apply on return.
9. **Intents not direct mutation** — player actions queue; sim applies atomically. No `GameEventDispatcher` for state.
10. **Strict Validation** — save shape change = version bump + migrator + strict Zod hydration.
11. **Declarative UI** — UI must be reactive (Lit + Valtio). Zero imperative DOM manipulation (`getElementById`, `classList`).
12. **No Global Pollution** — Nothing attaches to `window` outside of a single debug block.
13. **No God Objects** — The UI layer must not orchestrate simulation workers or audio controllers.

---

## 5. Hard Rejects

Do not ship. Do not "add as optional." Remediation required if present in live code.

### Genre & UX rejects

| # | Reject | Why |
|---|--------|-----|
| R1 | Wiki-dependent core mechanics | Failed onboarding |
| R2 | Run-ending punishment for experimentation | Blueprint/copy exists for a reason |
| R3 | Generic facility idle abstraction | Kills adjacency identity |
| R4 | Opaque or non-deterministic core math | Breaks theorycraft trust |
| R5 | Pure time gates with nothing to optimize | Wait Wall |
| R6 | Sudden meltdown with no phased warning | IC2 panic requires runway |
| R7 | 144-click grid fills without macros | RI table stakes |
| R8 | Visual-novel modals mid-optimization | Navalty lesson learned |
| R9 | Physics on UI thread | Shapez/Revival worker model |

### Identity violations (§13.2 — remediated unless noted)

| # | Reject | Status |
|---|--------|--------|
| I1 | Welfare money injection when broke | **Remediated** — failsafe removed from `runSellAction()` |
| I2 | Explosions as optimal cooling | **Remediated** — `explosive_decompression` removed; explosions add hull heat |
| I3 | Electricity heals depleted fuel rods | **Remediated** — `handlerAutonomicRepair` removed |
| I4 | Full-screen shop hides live reactor | **Remediated** — shop overlay keeps reactor + sim active (`shop-overlay-open`) |
| I5 | Global stat multipliers bypassing topology | **Remediated** — category-scoped modifiers in `part.js` |
| I6 | Late-game infinite manual vent scaling | **Remediated** — `improved_piping` one-shot; `emergency_coolant` capped at 3 |
| I7 | Plating that acts as exchanger | **Remediated** — `ceramic_composite` buffs hull heat, not transfer |
| I8 | Analytical offline multiply vs worker replay | **Remediated** — `runInstantCatchup()` removed; welcome-back uses `startOfflineFastForward()` |
| I9 | Infinite generic generated quests | **Remediated** — `INFINITE_CHALLENGES` removed |
| I10 | Ctrl+9 / Ctrl+E production cheats | **Remediated** — hotkey handlers removed |

Full evidence and remediation: [`related-projects-benchmark.md`](./related-projects-benchmark.md) §13.2.

### Engineering rejects

| # | Reject | Why |
|---|--------|-----|
| E1 | Dual physics (Tile methods + worker) | Divergence bugs |
| E2 | Mutable worker payloads during tick | Screeps race class |
| E3 | Import cycles | Shark Game lesson |
| E4 | God files > 1,500 lines | Knockoff graveyard |
| E5 | Implicit tick phase order | Space Company stale-read bugs |
| E6 | Leaky pub/sub without teardown | Memory and ghost listeners |
| E7 | Balance logic hardcoded by upgrade ID | Space Company data model |
| E8 | Imperative DOM Manipulation | Violates Law 2 (Declarative UI). Never use JS for things CSS/HTML handle natively (e.g., `<dialog>`). |
| E9 | Global `window` pollution | Violates Law 6 (Namespace Purity). Breaks headless testing. |
| E10| The `UI` God Object | Violates Law 6. `ui.js` cannot own the engine, state, DOM, and audio simultaneously. |

---

## 6. Implementation Index

Quick map from **component** → **canonical file(s)**. Use when implementing or reviewing PRs.

```
Simulation
  worker/gameLoopWorkerCore.js  ← single tick kernel (canonical)
  logic-heat-transfer.js        ← pressure-gradient heat step
  logic-topology.js               ← pulse + adjacency
  domain/engine.js                ← serialize, offline, loop bridge, intent drain
  worker/workerBoundary.js        ← tick input validation (dev/test)

Grid & state
  domain/grid.js                  ← Tile view layer (target: adapter only)
  state.js                        ← Valtio store, intent_queue, previewBlueprintPlannerStats
  state/ui-state.js               ← shell flags (pause, meltdown, leaderboard_sort, active_notice)
  heatDomSync.js                  ← heat display projection; isHeatNetBalanced shared with state derivations

Data & saves
  public/data/*.json              ← build input
  bundledStaticData.js            ← runtime Zod-validated bundle
  schema/saveMigration.js         ← v2 migration chain
  storage/local.js                ← STORAGE_KEYS manifest
  domain/game-save.js

Player UX
  domain/blueprint.js             ← applyBlueprintLayout (target: diff-based)
  domain/game.js                  ← blueprintPlanner slots/toggle
  components/ui-copy-paste.js     ← blueprint + copy/paste modal
  components/ui-heat-visuals.js   ← heat-flow + heat-map overlays
  components/input-manager.js     ← placement macros (hotkeys)
  components/ui-components.js     ← macro toolbar, meltdown sensory
  logic/objective-controller.js
  domain/achievements.js          ← AchievementManager
  logic/achievement-controller.js ← unlock toasts

Feedback pipeline
  domain/sim-events.js            ← recordSimEvent (domain → abstract events)
  state/game-effects.js           ← enqueue
  effect-orchestrator.js          ← drain sim events + effect_queue

Ops
  app.js                          ← boot, offline welcome-back trigger
  services-pwa.js                 ← PWA, changelog toast
  services-leaderboard.js
  changelog.js                    ← Zod loader for changelog.json
  tests/core/**                   ← trust gate
```

---

## 7. Decision Gate

Before building anything new, answer **yes** to all blockers; high-weight items should pass unless explicitly deferred in §3.6.

| Question | Weight |
|----------|--------|
| Does it match the §3 canonical row for this component (or replace it deliberately)? | Blocker |
| Does it preserve deterministic simulation? | Blocker |
| Does it preserve spatial adjacency identity? | Blocker |
| Does it violate any §5 reject? | Blocker |
| Does it reduce wiki/spreadsheet dependency? | High |
| Can it be data-driven (JSON/schema)? | High |
| Does it use the worker kernel (not a second sim path)? | High |
| Can it be tested in Vitest without Puppeteer? | High |
| Can it land as one strangler commit? | Medium |

**Reject** if any blocker fails. **Defer** if §3.6 applies.

---

## 8. Known Gaps (Rollup)

Prioritized delta between **canonical §3** and **live code**. Detail lives in benchmark audits — not duplicated here.

### P0 — Trust & correctness

| Gap | Canonical source | Fix direction |
|-----|------------------|---------------|
| Offline welcome-back gamble | Trimps + Revival | Earnings ledger shipped (`runChunkedOfflineReplay` → notice effect); meltdown projection before Fast-Forward still open |
| Worker/main dual representation | Shapez | Atomic commit; long-term ECS on main |
*(Resolved: Blueprint steady-state, diff-apply, replacement tax, weave forecasts, recovered-blueprint meltdown save)*

### P1 — Operator UX

| Gap | Canonical source | Fix direction |
|-----|------------------|---------------|
| Grid Undo History | RI | Wire `undoHistory` to `Ctrl+Z` and mobile toolbar |
| Effect pipeline incomplete | Shark Game | **Remediated** — domain uses `recordSimEvent()`; orchestrator maps to SFX/haptics; achievement unlocks enqueue `notice` effects |
| Architecture debt (V1–V5) | architecture-rules.md | See **Known Live Violations** — `utils.js` test shim, residual GameEventDispatcher emits, parts-panel imperative sync |

### P2 — Community

| Gap | Canonical source | Fix direction |
|-----|------------------|---------------|
| Achievement catalog depth | Radioactive Idle | 25 shipped; expand toward ~30 optional achievements |
*(Resolved: Compact share codes and layout A/B compare have been shipped)*

**Live friction index:** [`related-projects-benchmark.md`](./related-projects-benchmark.md) §9  
**Architecture friction index:** [`incremental-sim-architecture-benchmark.md`](./incremental-sim-architecture-benchmark.md) §8

---

## 9. Document Hierarchy

```
design-foundations.md          ← YOU ARE HERE (source of truth)
├── thematic-styling.md        ← visual identity, tokens, diegetic theming
├── core_principles.txt        ← physics & math authority
├── related-projects-benchmark.md      ← genre evidence catalog + game friction audits
├── incremental-sim-architecture-benchmark.md  ← engineering evidence catalog
└── .cursor/rules/phase-2-architecture.mdc     ← migration execution rules
```

**Maintenance**

- Change **canonical pattern** here first, then update benchmark catalogs if needed.
- Quarterly: verify §3 Status column against codebase; roll §8 gaps into PR backlog.
- New peer project: add row to appropriate benchmark catalog; only promote to §3 if it becomes the new canonical source for a component.
- Do not duplicate gap tables — §8 is a rollup; benchmarks hold evidence.

---

## 10. One-Page Summary

| Layer | We build | We reject |
|-------|----------|-----------|
| **Physics** | Revival pulse math + worker kernel | RNG, dual kernels, UI-thread sim |
| **Grid** | Shapez SoA on hot path; IC2 adjacency | OOP tiles with embedded physics; facility menus |
| **Ticks** | Space Company ordered orchestrator | Implicit phase spaghetti |
| **Input** | Screeps intent queue | Direct mutation from handlers |
| **Offline** | Trimps chunked worker replay | Analytical stat multiply |
| **Saves** | Revival Zod + Trimps migration chain | Unversioned save blobs |
| **Modules** | Shark Game registry, no cycles | Monolithic 5k-line files |
| **Balance** | Space Company JSON + trait masks | Hardcoded upgrade switches |
| **Planner** | MauveCloud analytics inside Revival PWA | External Java tools required |
| **Progression** | RI prestige arc + Revival objectives + partial achievements | Wiki cliff, infinite dailies |
| **UX** | Revival overlays + IC2 panic + Navalty flavor | Sudden death, dialogue walls |
| **Community** | Talonius codes + Knockoff changelog | Opaque balance, verbose JSON share |

**North star in one line:** *Trustworthy deterministic reactor sim with in-engine theorycrafting — one pattern per component, one kernel for all time.*
