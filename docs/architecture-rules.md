Reactor Revival: Architecture Manifesto & LLM Guardrails

This document defines the strict architectural boundaries for the Reactor Revival codebase. As the game grows, entropy and technical debt are natural enemies. These rules are not suggestions; they are immutable laws.

If a feature cannot be implemented without violating these laws, the core architecture must be refactored to support it cleanly. No hacks, no wrappers, no patching.
Law 1: Strict Unidirectional Data Flow

Core Principle: State is the single source of truth. Data flows down, actions flow up.

    1.1 No Event Emitters for State Mutations: Do not use GameEventDispatcher or similar Pub/Sub models to pass core simulation data around. All state changes must occur via direct, trackable mutations to the central valtio proxy store.

    1.2 Centralized Intent Queue: User inputs (clicks, keypresses) must never directly mutate game state. They must dispatch an "Intent" (e.g., { type: 'SELL_POWER' }) to a central queue. The game engine processes this queue synchronously at the start of the tick.

    1.3 Pure Evaluators: Systems like Objectives, Achievements, and Unlocks must act as pure evaluators on the host. They check if conditions are met (true/false) and may advance claim/index protocol. They must not dispatch economy commands (`GRANT_REWARD`, `CREDIT_MONEY`, etc.). Reward payout for objectives is owned by reactor-core-lib's `checkObjective` / `grantReward` path when the objective becomes complete; host claim only calls session `claimCurrent` (index advance). A first-class `CLAIM_OBJECTIVE` command remains a lib gap (F5.2).

Law 2: Declarative, Dumb UI (Lit-HTML)

Core Principle: The UI is a headless reflection of the state. It knows nothing about game logic.

    2.1 No Imperative DOM Manipulation: You are forbidden from using document.getElementById(), classList.add/toggle(), or createElement() outside of the initial application bootstrap.

    2.2 Bind, Don't Query: If a CSS class needs to change based on state (e.g., <body class="game-paused">), it must be bound declaratively in the top-level Lit template using classMap based on the Valtio state proxy.

    2.3 Native Browser APIs First: Do not write custom JavaScript for things HTML handles natively. Modals must use the native <dialog> element. Focus trapping, backdrops, and Escape key closures must rely on the native API, not custom event listeners.

    2.4 CSS for Layouts: Do not use JavaScript to calculate raw pixel dimensions, pinch-zoom bounds, or snap-back spring physics. Offload layout, scaling, and responsive design to CSS Grid, Flexbox, and CSS Variables.

    2.5 Headless UI Handlers: Files prefixed with ui- (e.g., ui-copy-paste.js) must only handle rendering and intent dispatching. They must not parse JSON, run cost calculations, or perform diffing. That logic belongs in domain/ files.

Law 3: Pure, Deterministic Simulation Engine

Core Principle: The Engine calculates math. It does not draw graphics or play sounds.

    3.1 No Visual Logic in the Engine: The physics/game loop workers must not contain visual configurations (e.g., MAX_VISUAL_EXPLOSION_FLASHES). The engine returns an array of state transitions or coordinates (e.g., explodedTiles: [12, 15]). The UI layer reads this and triggers the visual effects.

    3.2 Input -> Buffer -> Output: The Web Workers must act as pure calculators. They take a buffer of the grid state, calculate the next tick, and return a buffer. They must not trigger UI side-effects mid-calculation.

    3.3 No Manual Caching: Do not maintain parallel arrays (e.g., active_cells, active_vents) that require manual _isDirty flags to stay synced with the main grid. Derive processing lists deterministically from the single-source-of-truth grid state at the start of the tick.

Law 4: Event-Driven Side Effects

Core Principle: Audio, haptics, and browser APIs observe the game; the game does not observe them.

    4.1 Decoupled Audio: The AudioService must not read deep game state to make decisions. The game loop emits abstract, stateless events ("WARNING_LEVEL_CHANGED", "EXPLOSION"). The Audio service listens to these events and plays the corresponding buffer.

    4.2 Headless PWA/Service Workers: The PWA manager must not touch the DOM to render "Update Available" toasts. It should update a hasUpdate boolean in the global Valtio state. The UI layer will reactively render the toast.

Law 5: Strongly Typed Data & Centralized Configuration

Core Principle: Magic strings/numbers and corrupted saves destroy browser games.

    5.1 Centralized Configuration: Balancing mathematics, tick rates, and overflow thresholds live in strongly-typed schemas / `constants/balance.js` (via `balanceConfigSchema.js` / `sim.js`). UI presentation timings and sensory intensity live in `constants/ui-timing.js`. Do not invent new file-scoped magic numbers for those categories — extend the central modules.

    5.2 Strict Save Validation + Host Hydration: The save file parsing logic must validate via Zod and produce a plain JavaScript object before any live mutation. The Host then runs an explicit hydration pipeline (`game-save.js` SYNC/ASYNC/POST hydrators) that projects that DTO onto host objects (`game.state`, grid dimensions, reactor mirrors) and hydrates the lib session. A single lib `HYDRATE_SAVE` pure state-swap is not the 1.0 contract; do not pretend host hydration is forbidden — keep it assignment-only after Zod, never ad-hoc mid-session patches from unvalidated JSON.

Law 6: Modularity & Namespace Purity

Core Principle: Files should have one job. Global scope is lava.

    6.1 No Window Pollution: Attaching singletons to the global window object (window.splashManager, window.game) is strictly forbidden outside of a dedicated debug initialization block. Modules must rely on ES6 imports and explicit dependency injection.

    6.2 No "Junk Drawers": Files named utils.js or helpers.js are prohibited from containing mixed domain logic. IndexedDB wrappers go in storage/, math functions go in math/, and Zod schemas go in schema/.

    6.3 End the "God Object": The UI class must be broken down. It cannot hold references to the game engine, state manager, audio controllers, and modals simultaneously.

---

## Known Live Violations (Audit Index)

Tracked delta between these laws and **live code**. Remediation follows Strangler Fig: one boundary per commit, `npm test` green. Detail and evidence in [`incremental-sim-architecture-benchmark.md`](./incremental-sim-architecture-benchmark.md) §8.

| # | Violates | Where | Live behavior | Fix direction |
|---|----------|-------|---------------|---------------|
| V1 | **Law 6.2** (No junk drawers) | `public/src/utils.js` | **Remediated (app)** — zero `utils.js` imports under `public/src/`; thin re-export shim remains for `@app` test alias only | Delete shim after test imports migrate |
| V2 | **Law 3.3** (No manual caching) | `domain/part-classification.js` | **Fixed** — `ensureTickParts()` + engine getters; `rebuildActiveParts()` removed | — |
| V3 | **Law 3.1 & 4.1** (Engine ≠ audio) | `domain/sim-events.js`, `effect-orchestrator.js` | **Fixed** — domain `recordSimEvent()`; orchestrator maps to SFX/haptics/notices (`MANUAL_HEAT_REDUCE`, `PRESTIGE_REBOOT_TRIGGERED`, etc.) | — |
| V4 | **Law 2.1** (Declarative UI) | `state/ui-state.js`, `templates/sectionPageTemplates.js` | **Partial** — pause/meltdown banners, leaderboard sort, and `active_notice` are Lit-bound; `ui-state.js` still imperatively syncs parts-panel collapse and failure-banner visibility | Move remaining `classList` sync into shell `classMap` |
| V5 | **Law 1.1** (No pub/sub for state) | `domain/game.js` GameEventDispatcher | **Partial** — achievements route through `enqueueGameEffect`; `achievementCatchUpSummary`, `prestigeCompleted`, and `vibrationRequest` still emit | Phase A2: drain remaining emits into Valtio / `effect_queue` |

**Notes on V1:** Production code imports from `format/`, `core/`, `constants/`, `simUtils.js`, etc. ESLint `no-restricted-imports` still guards against reintroducing the barrel in `public/src/`.

**Notes on V2:** `syncActivePartsAtTickBoundary()` invalidates and re-derives; grid mutations bump `_partsRevision` on tileset.

**Notes on V4:** Heat-flow uses Lit `repeat` in `ui-heat-visuals.js`; settings help uses native `<dialog>`; layout cost math lives in `domain/blueprint.js`.

---

## LLM Prompting Guardrails (For the Human Operator)

To prevent tech debt and enforce the laws above, use these specific prompt suffixes when requesting changes from an LLM:

### 1. The "Delete First" Guardrail (Refactoring)
LLMs are additive by nature. Force them to be reductive.
> *"Do not write wrapper functions or patch over existing logic. If the current architecture does not naturally support this feature, rewrite the core function to accommodate it. Before writing new code, identify at least one thing we can delete, consolidate, or simplify."*

### 2. The Separation of Concerns Guardrail
Prevent the UI, DOM, and Simulation from turning into spaghetti.
> *"Maintain strict separation of concerns. The core game logic must be a pure state machine with zero knowledge of the DOM, browser window, or UI components. Return the updated state, and let a separate UI layer handle the rendering."*

### 3. The "Explain the Architecture" Guardrail
Force the LLM to articulate its plan before writing Frankenstein code.
> *"Do not write the code yet. First, explain how this change affects the global game state. Propose two ways to implement this: the fastest way, and the most architecturally sound way that prevents future tech debt. Explain the trade-offs of each."*

### 4. The Anti-Brittle Testing Guardrails
Prevent tautological or fragile tests.
> **For Unit Tests:** *"Write behavior-driven tests. Do not heavily mock internal game dependencies. Initialize the core game engine, trigger an input, and assert that the resulting global state matches expectations. Do not write tests that merely assert that a function was called."*
> 
> **For E2E Tests:** *"Do not use arbitrary timeouts or hardcoded CSS selectors. Use robust data attributes (data-testid) and wait for specific DOM mutations or network states to resolve before asserting."*

### 5. The "Context Diet" Guardrail (Process Rule)
Do not feed the AI entire files if you only want to change one thing.
1. Extract the single function or class you want to fix.
2. Paste only that into the prompt.
3. Paste the newly generated code manually back into your project.
This forces you to act as the integration layer and keeps your mental map of the project intact.