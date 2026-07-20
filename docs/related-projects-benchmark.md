# Related Projects Benchmark & Synthesis Plan (v2.0)

> **Canonical source of truth:** `[design-foundations.md](./design-foundations.md)` — one pattern per component. This document is the **genre evidence catalog** (deep dives, friction audits, gap tables).
>
> **Purpose:** Deep review of reactor incremental / simulation projects in the same lineage as Reactor Revival. This document builds a **comprehensive Design Model** highlighting critical areas of improvement and toxic patterns to avoid, ensuring we extract the best genre concepts without adopting their historical flaws.
>
> V1 identified *what* features to port. V2 identifies *how* to implement them by analyzing the psychological and systemic successes/failures of our predecessors.
>
> **Audience:** Core contributors planning features, balance, game design, and architecture.
>
> **Last updated:** 2026-06-24 (v2.5 Catalog — Adjacent grid reactors, mod planners, spatial puzzles)

---

## 1. Executive Summary

Reactor Revival sits at the **modern end** of a long lineage: Minecraft IC2 reactors → browser planners → Reactor Incremental → open-source forks → our PWA-native, worker-backed simulation.

**The core realization:** The greatest threat to Reactor Revival is not a lack of features, but the **"Spreadsheet Wall"** — the point where a reactor game becomes so opaque or tedious that players are forced to rely on external tools, wikis, or monolithic spreadsheets to progress. Our north star is to build a game that contains its own theorycrafting, onboarding, and automation tools organically.

**Our strongest differentiators today**


| Area                 | Reactor Revival advantage                                                                           |
| -------------------- | --------------------------------------------------------------------------------------------------- |
| Simulation integrity | Deterministic tick engine, worker physics, pulse math documented in `core_principles.txt`           |
| Technical foundation | Zod save pipeline, Valtio state, Vitest coverage, PWA + offline catchup                             |
| UX depth             | Blueprint planner with cost preview, heat flow/map overlays, objectives/chapters, difficulty curves |
| Ops                  | Leaderboard outbox + circuit breaker, screenshot/UI audit tooling                                   |


**Biggest opportunities borrowed from peers**


| Source                             | Opportunity                                                                           |
| ---------------------------------- | ------------------------------------------------------------------------------------- |
| IC2 / MauveCloud planners          | Simulation modes, tick-level analytics export, compact share codes, design comparison |
| Reactor Incremental                | Macro placement, cloud save parity, prestige UX clarity, mature late-game EP economy  |
| Reactor Knockoff                   | Lightweight onboarding patterns, changelog-driven community trust                     |
| Reactor Redux                      | Multi-node energy topology (optional long-term expansion)                             |
| Radioactive Idle / narrative games | Achievement/sacrifice loops, tension framing                                          |
| 2024–2025 itch.io titles           | Facility-layer abstraction, meaningful risk/reward messaging                          |
| Perfect Tower II / Factory Idle    | Embedded spatial optimizers, footprint-scarce challenge scenarios                     |
| NC / Big Reactors planners         | Adjacency debugger UX, URL-encoded share designs, what-if sliders                     |
| SpaceChem / Cell Machine           | Deterministic scenario scoring, "press play to validate" blueprint UX                 |


**Recommended north star:** *Be the most trustworthy browser reactor simulator* — planner-grade analytics + incremental-grade progression + Revival-grade engineering — not a clone of any single predecessor.

---

## 2. The Reactor Design Model: Improvements vs. Avoidance

Based on a deep dive into 10+ years of reactor simulators, we formalize a design model split into two categories: **what we must elevate** (Improvements) and **what we must reject** (Avoidance).

### Areas of Improvement (The "Elevate" Pillars)


| Pillar                                     | Historical problem                                                                        | Revival model                                                                                                                                                           |
| ------------------------------------------ | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **In-Engine Theorycrafting (The Sandbox)** | Players used external Java tools (MauveCloud) because base games punished experimentation | Risk-free blueprint/sandbox mode that calculates steady-state ticks instantly                                                                                           |
| **Deterministic Trust**                    | Idle games lose players when offline progress feels "robbed" or inaccurate                | Pulse physics on a deterministic worker loop; offline catch-up uses exact tick simulation (or mathematically proven approximations), never crude averages               |
| **The Automation Curve**                   | IC2 and early RI forced tedious manual component replacement                              | Progression transitions the player from "Manual Operator" to "Systems Architect"; automation (auto-buy, auto-replace, smart heat routing) is the reward for progression |
| **Transparent Topologies**                 | Hidden math frustrates players                                                            | UI overlays (heat flow arrows, heat maps) visually explain the mathematical reality of the grid                                                                         |


### Areas to Avoid (The "Traps")


| Trap                                     | Rule                                                                                                                                                                                                               |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **The "Wiki Dependency" Trap**           | If a player has to Google "How does Exotic Particle Weaving work?", we have failed UI design. Mechanics must be taught via phased objectives, not info-dumps.                                                      |
| **The "Punishing Experimentation" Trap** | RI degraded refund values for hot components — adds stakes but discourages trying new layouts. Blueprint modes must be free. Live grid mistakes should have consequences, but not run-ending ones.                 |
| **Abstraction Drift**                    | Games like Nuclear Power Idle abstracted the grid into generic "Facilities." **The grid is our identity.** Do not abstract away spatial adjacency puzzles.                                                         |
| **The "Wait Wall" Pacing**               | Progression stalling purely behind massive time gates with nothing to optimize. If the player waits days for an upgrade, they should spend that time optimizing a layout for a 5% gain — not just closing the tab. |


---

### The Mega Sauces (Franchise Carriers)

Psychological hooks, mechanical gold nuggets, and systemic rewards that generate long-term retention and define game identity. **Elevate these in every feature decision.**


| #   | Mega Sauce                                            | What it means                                                                                                                                                                                                                              |
| --- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | **Diegetic Immersion & Tactile Panic**                | The UI is a physical, dangerous workstation — Sovietwave/industrial fantasy with CRT scanlines and ambient hum. Heat rise → visual degradation, klaxons, screen shake. Abstract math becomes visceral "bomb defusal."                      |
| 2   | **In-Engine Theorycrafting (The Sandbox)**            | Risk-free blueprint mode with instant steady-state tick calculation. Players "solve" Net 0 heat puzzles without leaving the game or spending money.                                                                                        |
| 3   | **Cascading Obsolescence**                            | Grid expansions and new cell shapes elegantly invalidate old layouts — joy of re-optimization without feeling punitive.                                                                                                                    |
| 4   | **The "Morning Coffee" Reward & Deterministic Trust** | Offline catch-up is deterministic **within** the safety cap (`MAX_ACCUMULATOR_MULTIPLIER` = 100 ticks ≈ 100s). Multi-hour full replay is intentionally not shipped (browser freeze risk). Welcome-back must project meltdown risk before Fast-Forward — §9 #8. |
| 5   | **Community Currency (Shareability)**                 | Short, elegant, URL-linkable layout codes. Share, compare diffs, display superior builds on Discord/Reddit as badges of honor.                                                                                                             |
| 6   | **The Cascading Dopamine Hit & Pavlovian Audio**      | Rhythmic ASMR tick audio bound to simulation cadence. Massive power surges and perfect EP weaves celebrated with rippling UI particle effects — math as visual fireworks.                                                                  |
| 7   | **Transparent Topologies (Visual Math)**              | Never hide grid reality in dense tooltips alone. Heat-flow arrows and heat-map overlays map math directly onto the grid.                                                                                                                   |
| 8   | **The Automation Hand-off**                           | Smooth transition from Manual Operator → Systems Architect. Auto-buy, auto-replace, and smart heat routing unlock as progression rewards.                                                                                                  |


---

### The Frictions (Absolute Avoids)

Design traps, technical flaws, and pacing walls that cause drop-off and kill momentum. **Reject these outright.**


| #   | Friction                               | Rule                                                                                                                                                                                                                                                        |
| --- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **The "Spreadsheet & Wiki" Wall**      | Never build a game so opaque players must Google basic mechanics (e.g. EP Weaving). Teach via phased objectives, not info-dumps.                                                                                                                            |
| 2   | **Punitive Experimentation**           | Never severely degrade refunds or impose run-ending consequences for trying new layouts. Live stakes yes; grid destruction to test one exchanger, no. Blueprint apply must not fail silently; meltdown must not erase unsaved designs — see §9 #2, #4, #10. |
| 3   | **Abstraction Drift**                  | Do not abstract the grid into generic facilities or menus. Spatial adjacency is identity.                                                                                                                                                                   |
| 4   | **Opaque & Non-Deterministic Math**    | No RNG or chain-reaction randomness in core physics. Every tick output must be calculable.                                                                                                                                                                  |
| 5   | **The "Wait Wall" & Linear Grinding**  | Do not stall progression on pure time gates or endless 1.5× cost multipliers. Waiting must pair with active layout optimization.                                                                                                                            |
| 6   | **The "Meltdown" UX (Sudden Death)**   | Never wipe progress from a tiny red bar with no warning. Phased feedback: 80% Warning LED → 100% UI shaking → 110% CRT tearing → Meltdown.                                                                                                                  |
| 7   | **Tedious Micro-Management**           | No 144-click grid fills. Macro tools (row/col fill, area clear) are table stakes. Avoid multiple disconnected grids too early.                                                                                                                              |
| 8   | **Pacing Interruptions**               | Never break flow with visual-novel dialogue when the player is mid-optimization. Flavor via toasts and banners, not modal text walls.                                                                                                                       |
| 9   | **Technical Debt & UI Thread Locking** | No monolithic 5k-line JS. Grid physics on a deterministic Web Worker, not the UI thread. Saves protected by schema validation and migration.                                                                                                                |


---

## 3. Lineage Map

```
IndustrialCraft² (Minecraft mod)
    ├── Talonius Reactor Planner (v3 codes)
    └── MauveCloud Ic2Exp Reactor Planner (Java simulation tool)
              │
Reactor Idle (Baldurans, proto-idle) ──► Reactor Incremental (Cael, 2015)
              │                                    │
              │                                    └── Reactor Redux (Cael, 2019) — network/grid sequel
              │
              ├── Reactor Knockoff (cwmonkey) — OSS clone + layout I/O
              │         └── reactor-knockoff-enhanced (React rewrite, incomplete)
              │
              └── Reactor Revival (jdial1) — modern PWA substrate
                        │
Parallel experiments: Radioactive Idle, Nuclear Power Idle, The Reactor (Navalty),
                      Reactor Energy Sector Tycoon / Idle Reactor (RSG, mobile),
                      Nuclear Tycoon (mobile), Perfect Tower II (Power Plant minigame),
                      Factory Idle
Mod planners (IC2 lineage): Talonius v3 → MauveCloud → Hellrage NC (hiatus) → ThizThizzyDizzy nc-reactor-generator → sidoh Big Reactors
Adjacent grid puzzles: Cell Machine, SpaceChem, Gridland
```

---

## 4. Project Catalog: Hooks, Friction & The "Secret Sauce"

Each entry: **what it is**, **core design principles**, **what it does well**, **what to avoid**, **Revival relevance**. Key entries include a **deep-dive** on psychological hooks, identified friction points, the subtle **gold nuggets** that drove long-term retention, and concrete **Revival applications**.

**Catalog scope (§4.14–§4.20):** Direct grid-reactor successors (Perfect Tower II Power Plant, Factory Idle), advanced mod planners (NuclearCraft, Big Reactors), and adjacent spatial-puzzle games (Cell Machine, SpaceChem, Gridland) that share adjacency optimization DNA without nuclear incremental loops.

---

### 4.1 IndustrialCraft² Reactor (mod)


|                     |                                                                                                                 |
| ------------------- | --------------------------------------------------------------------------------------------------------------- |
| **Link**            | [Old Reactor Mechanics](https://wiki.industrial-craft.net/index.php?title=Old_Reactor_Mechanics_and_Components) |
| **Type**            | In-game nuclear simulation (EU + fluid variants)                                                                |
| **Role in lineage** | Original mechanical vocabulary: cells, vents, exchangers, reflectors, hull heat                                 |


**Design principles**

- Components have **explicit numeric stats** (heat gen, vent rate, capacity) — players optimize from datasheets.
- **Hull vs component heat** creates two failure layers.
- **Adjacency matters** — reflectors and heat paths are spatial puzzles.
- **Automation** (replacements, redstone pulsing) is a first-class design dimension.

**Steal**

- Treat every part as a **data row with testable invariants**, not a special case.
- Keep **component ↔ real-world metaphor** in tooltips (already strong in our `part_list.json`).

**Skip**

- Minecraft-specific crafting chains and mod interoperability complexity.

**Revival status:** Mechanics partially inherited via Incremental/Knockoff; we exceed IC2 in browser accessibility.

**Hooks, friction & secret sauce**


|                         |                                                                                                                                                                                                                        |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Psychological hook**  | High stakes. A bad layout doesn't just halt progress; it blows a crater in your Minecraft base.                                                                                                                        |
| **Friction point**      | High cognitive load & tedium. Managing cooling cells that degrade over time became a repetitive chore rather than a strategic puzzle.                                                                                  |
| **Secret sauce**        | **Tactile panic & visual degradation.** Components physically looked like they were melting in your inventory via durability bars. Abstract math became visceral "bomb defusal" tension.                               |
| **Revival application** | Deepen meltdown visual states. Make CRT screens shake, add warning klaxons, and make heat bars look physically volatile before total failure. Replace manual chore-work with unlocked automation (Perpetual upgrades). |


---

### 4.2 Talonius IC² Reactor Planner (v3)


|                     |                                                                                                                                                                                                                 |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Link**            | [IC² Forum thread](https://forum.industrial-craft.net/thread/2147-new-reactor-planner-made-by-talonius/) · [GitHub (community mirrors)](https://github.com/search?q=Talonius+reactor+planner&type=repositories) |
| **Type**            | Desktop Java design tool (pre-Experimental IC²)                                                                                                                                                                 |
| **Role in lineage** | Historic gold standard before browser planners — test layouts without blowing up your base                                                                                                                      |


**Design principles**

- **Design-first, play-second** — optimize before building in-world.
- **Shareable layout codes** — community spreads builds via paste strings (v3 codec became the lingua franca for early planners).
- **Tick-faithful simulation** — desktop Java app mirrored in-game pulse math so theorycraft matched reality.
- **Import lineage** — later planners (MauveCloud, Knockoff paste) preserve backward compatibility.

**Steal**

- Stable **layout serialization format** with version field (we have blueprint paste; extend with versioned codec).
- **URL/deep-link friendly codes** for sharing (short base64 + schema version).
- **Offline-first planner UX** — no account, instant simulate; Revival blueprint mode should feel as frictionless.

**Skip**

- Legacy component mapping baggage.
- Java download/install friction — browser-native planners won for accessibility.

**Revival status:** Copy/paste + blueprint planner exist; need shorter share URLs and cross-version import guarantees. Combined deep-dive with MauveCloud in §4.3.

**Hooks, friction & secret sauce**


|                         |                                                                                                                                                                      |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Psychological hook**  | **Risk-free experimentation.** Players could push layouts to meltdown in simulation without losing hours of Minecraft progress.                                      |
| **Friction point**      | **Platform lock-in.** Java desktop install, manual updates, and pre-Experimental component drift left casual players on wikis anyway.                                |
| **Secret sauce**        | **Community currency via paste codes.** Short strings traveled through forums and Discord as badges of optimization skill — the original "shareable layout" culture. |
| **Revival application** | Treat blueprint paste + future URL codes as first-class social features (§2 Mega Sauce #5). Version the codec explicitly so imports survive balance patches.         |


---

### 4.3 MauveCloud & Talonius Planners

The community's response to IC2's opacity. Talonius (§4.2) established shareable layout codes; MauveCloud added tick-granular simulation depth.


|                        |                                                                                                                                                                                                                                                                                          |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Links**              | [Talonius forum](https://forum.industrial-craft.net/thread/2147-new-reactor-planner-made-by-talonius/) · [MauveCloud GitHub](https://github.com/MauveCloud/Ic2ExpReactorPlanner) · [MauveCloud forum](https://forum.industrial-craft.net/thread/10998-ic2-experimental-reactor-planner/) |
| **Type**               | Standalone Java/desktop design tools                                                                                                                                                                                                                                                     |
| **Stars (MauveCloud)** | ~191                                                                                                                                                                                                                                                                                     |


**Design principles**

- **Multiple simulation modes:** simple cycle, pulsed cycle, pulsed automation (replace hot parts).
- **Tick-granular truth:** CSV export of per-component heat/damage each tick → spreadsheet analysis.
- **Honest averages:** show hull heating/cooling only after stabilization window (20s+).
- **Import compatibility** with warnings for deprecated components.
- **i18n-ready** UI strings.

**Steal (high value)**


| Feature                      | Revival application                                                         |
| ---------------------------- | --------------------------------------------------------------------------- |
| Simulation mode selector     | Add "Sandbox / Live / Fast-forward stress" modes in blueprint planner       |
| CSV tick export              | Export last N ticks of heat/power/EP from worker for theorycrafting         |
| Stabilization metrics        | Show "steady-state EU/t & heat/t" after X ticks in planner preview          |
| Component automation presets | Future: auto-replace thresholds as planner scenario, not just live upgrades |
| Comparison view              | Diff two layouts' steady-state stats side-by-side                           |


**Skip**

- Desktop Java deployment model; GT mod component explosion.

**Revival status:** `previewBlueprintPlannerStats` is the seed; planner analytics is the largest functional gap vs best-in-class tools.

**Hooks, friction & secret sauce**


|                         |                                                                                                                                                                                                                                                             |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Psychological hook**  | "Solving" the puzzle — tweaking a layout until heat generated perfectly matches heat dissipated (Net 0).                                                                                                                                                    |
| **Friction point**      | **Sterility.** Total disconnect from gameplay consequences; planners are inherently static spreadsheets.                                                                                                                                                    |
| **Secret sauce**        | **Community currency.** Share codes didn't just save time; they acted as badges of honor on forums. Players competed to squeeze out 1 more EU/t, establishing a meta-game outside the game.                                                                 |
| **Revival application** | Bring the planner inside the game (`previewBlueprintPlannerStats`, blueprint stability label). Make layout export strings short, elegant, and URL-linkable. Integrate an A/B **compare diff** so players can see why one layout is mathematically superior. |


---

### 4.4 Reactor Incremental (Cael)


|          |                                                                                                                           |
| -------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Link** | [Kongregate](https://www.kongregate.com/games/Cael/reactor-incremental) · [Wiki](https://reactor-incremental.fandom.com/) |
| **Type** | Canonical browser incremental (2015, still maintained)                                                                    |
| **Role** | Defines genre expectations                                                                                                |


**Design principles**

- **Pulse adjacency:** power ∝ pulses, heat ∝ pulses² — density has a cost (see `core_principles.txt`).
- **Dual currency:** money (run) + Exotic Particles (permanent).
- **Prestige gate:** EP from production *and* dissipation balance — anti-one-dimensional builds.
- **Refund degradation:** hot parts sell for less; cells never refund — placement has consequence.
- **Offline progress + Time Flux:** catch up fairly when returning.
- **Leaderboard = EP** — single competitive score.
- **Cloud save (Google Drive)** — session portability.

**Steal**


| Feature                            | Notes                                                                                             |
| ---------------------------------- | ------------------------------------------------------------------------------------------------- |
| Macro / multi-place tools          | RI players rely on bulk placement; our grid UX should match                                       |
| Clear first-prestige guidance      | Wiki advises 51 EP before first reboot — we have objectives; mirror with explicit EP milestone UX |
| Save import/export discoverability | Prominent in options; we have `.reactor` file handler — surface it in UI                          |
| Changelog + author communication   | Trust loop for balance changes                                                                    |


**Skip**

- Unity/WebGL legacy constraints; Kongregate platform lock-in.

**Revival status:** Core loop parity strong; macros and cloud save remain gaps. Prestige onboarding, save UX help, offline help, and sell-consequence copy **shipped** (Tier S).

**Hooks, friction & secret sauce**


|                         |                                                                                                                                                                                                                                                                                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Psychological hook**  | The **"Prestige Engine"** — balancing power generation against heat dissipation to maximize Exotic Particles (EP) on reset created a brilliant optimization loop.                                                                                                                                                                           |
| **Friction point**      | **The EP Cliff.** Players hit a massive pacing wall around 50 EP where progress slowed to a crawl, requiring highly specific, wiki-sourced layouts to break through — or forcing players to quit.                                                                                                                                           |
| **Secret sauce**        | **Cascading obsolescence & Pavlovian audio.** The subtle, rhythmic "tick" of money going up created a subconscious ASMR loop. Just when a player "solved" their 3×3 grid, they unlocked a 4×4 grid or a new cell shape — elegantly invalidating the old layout and forcing the joy of optimization all over again without feeling punitive. |
| **Revival application** | Smooth the EP Cliff via `difficulty_curves.json` and chapter objectives (no wiki). Ensure grid expansion upgrades drastically alter topological math. Keep `audio.sys.js` tightly bound to tick cadence.                                                                                                                                    |


---

### 4.5 Reactor Knockoff (cwmonkey)


|            |                                                                                                               |
| ---------- | ------------------------------------------------------------------------------------------------------------- |
| **Link**   | [Play](https://cwmonkey.github.io/reactor-knockoff/) · [GitHub](https://github.com/cwmonkey/reactor-knockoff) |
| **Type**   | OSS Incremental clone (2015–2018 active)                                                                      |
| **Assets** | We attribute UI/parts adapted from this project                                                               |


**Design principles**

- **Faithful clone scope** — reproduce RI loop without platform fees.
- **Layout import/export** as core feature (v1.3.x changelog).
- **Minimal stack** — HTML/CSS/JS, fast to fork.
- **Patch notes in-app** — transparency builds contributor goodwill.

**Steal**

- **In-app changelog / What's New** on version bump (we have PWA update flow — connect them).
- **Simple reboot copy** — two-button prestige/refund clarity (we already have modal templates).

**Skip**

- Monolithic JS structure (we're actively splitting — see `.cursor/rules/phase-2-architecture.mdc`).
- Incomplete late-game parity with RI.

**Revival status:** Spiritual predecessor for assets; we exceed on engineering. Changelog + Settings "Recent Changes" **shipped**.

**Hooks, friction & secret sauce**


|                         |                                                                                                                                                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Psychological hook**  | Lightweight, instant-load browser accessibility.                                                                                                                                                                    |
| **Friction point**      | **Monolithic technical debt.** A single 5,000-line JS file made adding features impossible without breaking existing mechanics or causing save corruption.                                                          |
| **Secret sauce**        | **Frictionless iteration.** By stripping Unity WebGL loading screens and heavy graphics, it respected the player's time. The loop of "tweak, reset, observe" was lightning fast — appealing to hardcore min-maxers. |
| **Revival application** | Ruthlessly protect PWA load times and UI snappiness. Do not let heavy graphical additions compromise immediate grid responsiveness. Strictly adhere to Phase 2 architecture (Domain/State/Logic split).             |


---

### 4.6 Reactor Knockoff Enhanced (KamilPacanek)


|          |                                                                                                                                         |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **Link** | [GitHub](https://github.com/KamilPacanek/reactor-knockoff-enhanced) · [Play](https://kamilpacanek.github.io/reactor-knockoff-enhanced/) |
| **Type** | React/TypeScript rewrite (learning project, stalled)                                                                                    |


**Design principles**

- **Rewrite for maintainability** — same game, modern component model.
- **Explicit "missing features" backlog** — honest scope vs RI.
- **Community permission** — fork etiquette (Reddit blessing from cwmonkey).

**Lesson for Revival**

- Rewrites fail when **gameplay parity** isn't tracked milestone-by-milestone.
- Our Phase 2 architecture split is the correct alternative: **strangler fig**, not big-bang rewrite.

---

### 4.7 Reactor Redux (Cael)


|              |                                                                   |
| ------------ | ----------------------------------------------------------------- |
| **Link**     | [Kongregate](https://www.kongregate.com/games/cael/reactor-redux) |
| **Type**     | Sequel — interconnected reactor **network** on a grid             |
| **Released** | 2019 (finished)                                                   |


**Design principles**

- **Scale through topology** — multiple reactors, transport, storage nodes.
- **Same idle/incremental skeleton** — prestige, offline, upgrades.
- **Factory-graph fantasy** — energy routing as puzzle layer.

**Steal (optional expansion track)**

- **Second grid layer** or **adjacent sub-reactors** linked by heat pipes / power buses.
- **Network metrics** — throughput, bottleneck highlighting.

**Skip (for 1.0)**

- Full Redux scope would dilute our IC2-single-chamber identity.

**Revival status:** Not in scope near-term; document as **Phase 3+ expansion** if player base asks for factory-scale play.

**Hooks, friction & secret sauce**


|                         |                                                                                                                                                                                                             |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Psychological hook**  | **Scale** — connecting and balancing multiple reactors simultaneously.                                                                                                                                      |
| **Friction point**      | **Cognitive overload.** Managing multiple separate reactor grids diluted the tight micro-optimization puzzle into tedious macro-management.                                                                 |
| **Secret sauce**        | **Macro-orchestration.** Captured the Factorio itch by turning the reactor from the whole game into a component of a larger logistics puzzle. Solving power routing between buildings became the core draw. |
| **Revival application** | Not for 1.0. If we expand, linking separate grids via heat pipes or power relays must be gated behind late-game automation to prevent early-game overload.                                                  |


---

### 4.8 Radioactive Idle (kolya5544)


|           |                                                                                             |
| --------- | ------------------------------------------------------------------------------------------- |
| **Link**  | [Play](https://nk.ax/radioactive/) · [GitHub](https://github.com/kolya5544/RadioactiveIdle) |
| **Type**  | Chain-reaction incremental (2023–2024)                                                      |
| **Stack** | Vanilla JS                                                                                  |


**Design principles**

- **Different core fantasy** — fission chain reactions, not grid IC2.
- **Sacrifice / reset unlock** — progress bar toward meta unlocks.
- **Achievement hooks** — light meta rewards.
- **Open beta honesty** — sets expectations.

**Steal**

- **Achievement system** for teaching mechanics (complements our objectives).
- **Named reset milestones** ("Sacrifice") as optional prestige flavor.

**Skip**

- Chain-reaction physics model (conflicts with our deterministic pulse substrate).

**Hooks, friction & secret sauce**


|                         |                                                                                                                                                                                                                                                                 |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Psychological hook**  | Exponential fission chain reactions.                                                                                                                                                                                                                            |
| **Friction point**      | **Opaque & non-deterministic math.** Chain-reaction randomness rather than strict, calculable pulse mechanics — frustratingly impossible to theorycraft a "perfect" build.                                                                                      |
| **Secret sauce**        | **The cascading dopamine hit.** Watching a chain reaction physically ripple across the UI provided immense visual satisfaction. Abstract math became a visceral fireworks display; "activation" was intensely rewarding.                                        |
| **Revival application** | Enhance particle effects (`ui-heat-visuals.js`). When a player achieves a massive power surge or a perfect EP weave, the UI should celebrate with rippling energy effects on the **deterministic** grid. Open-beta honesty on quick-start **shipped** (Tier S). |


---

### 4.9 Nuclear Power Idle (KamilGrajDev)


|              |                                                            |
| ------------ | ---------------------------------------------------------- |
| **Link**     | [itch.io](https://kamilgrajdev.itch.io/nuclear-power-idle) |
| **Type**     | Facility management idle (2025)                            |
| **Platform** | Desktop browser                                            |


**Design principles**

- **Building-level abstraction** — upgrade buildings, not individual tiles.
- **Strategic reset climbing** — prestige for multipliers.
- **Low art overhead** — AI-assisted graphics, dev transparency.

**Steal**

- **Facility summary panels** — aggregate stats per "cooling zone" or "fuel bank" on our grid.
- **Dev blog / devlog** on itch or GitHub Releases for non-technical players.

**Skip**

- Replacing tile sim with building menus — our identity is the grid (see **Abstraction Drift** trap, §2).

**See also:** §4.13 Mobile Tycoons cross-cut (Morning Coffee offline reward, monetization traps).

---

### 4.10 The Reactor (Navalty Game Studio)


|          |                                                |
| -------- | ---------------------------------------------- |
| **Link** | [itch.io](https://navalty.itch.io/the-reactor) |
| **Type** | Narrative incremental (Godot, short jam-scale) |


**Design principles**

- **Meaningful tension** — city demands power; failure has story weight.
- **Risk/reward framing** — push output vs stability as explicit choice.
- **Run-based lessons** — failures grant permanent insight/upgrades.

**Steal**

- **Flavor text + stakes** in objectives (we have `flavor_text.json` — use it in meltdown/near-miss moments).
- **"City demand" optional scenario** — timed power quotas as challenge mode.

**Skip**

- Heavy visual novel structure — keep optional.

**Hooks, friction & secret sauce**


|                         |                                                                                                                                                                                                                                                                                     |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Psychological hook**  | **Narrative framing** — "The city demands power; you must deliver."                                                                                                                                                                                                                 |
| **Friction point**      | **Pacing interruptions.** Heavy visual novel structure and dialogue boxes broke flow state, forcing players to read text walls when they wanted to optimize their grid.                                                                                                             |
| **Secret sauce**        | **Diegetic immersion.** CRT scanlines, ambient facility hum, and UI as a literal terminal screen made the player feel like a stressed Soviet engineer — not just a UI, but a physical workstation.                                                                                  |
| **Revival application** | Lean into Sovietwave/industrial UI theme. `ui-idle-effects.css` and background hums should ground the player in operating heavy, dangerous machinery. Use non-intrusive flavor text (`flavor_text.json`, `failure_flavor.json`, chapter toasts) for story without halting gameplay. |


---

### 4.11 Reactor — Energy Sector Tycoon / Idle Reactor (RSGapps)


|                     |                                                                                                                                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Link**            | [Google Play](https://play.google.com/store/apps/details?id=com.rsgapps.reactor) · [App Store](https://apps.apple.com/us/app/reactor-idle-tycoon/id1086730643) · [RSGapps](https://rsgapps.com/) |
| **Type**            | Mobile idle tycoon (also marketed as *Reactor Idle Tycoon* / *Idle Reactor*)                                                                                                                     |
| **Role in lineage** | One of the most fully realized mobile takes on the Reactor Incremental concept — 10M+ downloads                                                                                                  |


**Design principles**

- **Grid placement on limited footprints** — buy plots, place turbines/solar early, unlock nuclear/fusion grids with heat management.
- **Heat vs. power equation** — reactors yield highest ROI but require active heat conversion; neglect → explosion.
- **Portfolio of plant types** — 15+ generators from wind through dark-energy reactors; nuclear is the prestige tier.
- **Map unlock progression** — 10+ locations, each a fresh optimization canvas.
- **Incremental loop** — money → upgrades → larger grids → prestige; offline income with no cap.
- **Component degradation / replacement** — late plants need upkeep and automation research to stay stable.

**Steal**

- **Challenge maps** with modifiers (our `difficulty_curves.json` is the seed — add map-specific rulesets).
- **Auto-workflow upgrades** framed as "automation research" — mirrors our Manual Operator → Systems Architect arc.
- **Risk/reward plant tiers** — stable low-yield vs. high-yield unstable reactors as explicit player choice.

**Skip**

- Generic tycoon skin over reactor; multi-energy dilutes spatial puzzle identity (see **Abstraction Drift**, §2).
- Ads, premium currency, and mobile monetization patterns (§4.13).

**Revival status:** Validates mobile demand for heat-management idle loops; we win on puzzle purity and planner depth. See §4.13 for cross-cut mobile lessons.

**Hooks, friction & secret sauce**


|                         |                                                                                                                                                                                                                        |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Psychological hook**  | **Empire fantasy on a phone.** Start with a wind turbine, end owning fusion reactors across a country — the RI progression fantasy packaged for commute sessions.                                                      |
| **Friction point**      | **Abstraction drift + monetization.** Grid puzzles dissolve into building menus and tap-to-upgrade; ads and time gates interrupt optimization flow. Heat math is opaque compared to RI/Knockoff.                       |
| **Secret sauce**        | **The "Morning Coffee" offline reward** at industrial scale — uncapped offline earnings make opening the app the first task of the day (§4.13). Heat explosions add stakes without full run wipes.                     |
| **Revival application** | Steal map modifiers and automation framing; **skip** monetization. Welcome-back UI must match mobile dopamine (§9) while keeping deterministic tick trust. Never dilute adjacency puzzles into generic facility cards. |


---

### 4.12 Nuclear Tycoon / Nuclear Empire (AlexPlay)


|          |                                                                                         |
| -------- | --------------------------------------------------------------------------------------- |
| **Link** | [Google Play](https://play.google.com/store/apps/details?id=net.alexplay.nuclearempire) |
| **Type** | Mining + factory mobile idle                                                            |


**Design principles**

- **Resource chain** — mine → refine → build → expand territory.
- **Collection meta** — blueprints, cards, holograms.
- **Minigame variety** — mines, towers, etc.

**Steal**

- **Blueprint collection** as cosmetic/meta gallery for shared layouts (social retention).
- **Territory unlock** → maps to our grid expansion upgrades.

**Skip**

- Gacha/collection monetization patterns.

---

### 4.13 Mobile Tycoons — Cross-Cut (Nuclear Power Idle, Energy Sector Tycoon / Idle Reactor, Nuclear Empire)

Facility-management idlers that abstracted or diluted the grid puzzle. Individual entries: §4.9, §4.11 (also marketed as *Idle Reactor* / *Reactor Idle Tycoon*), §4.12.

**Hooks, friction & secret sauce**


|                         |                                                                                                                                                                                                                                                                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Psychological hook**  | Idle offline progression, territory expansion, and visual base building.                                                                                                                                                                                                                                                              |
| **Friction point**      | **Predatory monetization & abstraction.** Puzzle purity compromised by artificial time-gates, premium currency, gacha, and forced ads. The grid was often abstracted into generic menus (see **Abstraction Drift**, §2).                                                                                                              |
| **Secret sauce**        | **The "Morning Coffee" reward** (peer mobile tycoons). Those titles tuned long offline gaps (e.g. overnight) into a satisfying morning upgrade spree — a design aspiration, not Revival's live contract.                                                                                           |
| **Revival application** | Catch-up is deterministic inside `MAX_ACCUMULATOR_MULTIPLIER` (100 ticks) via chunked worker replay; welcome-back UI shows the capped ledger. Do not advertise uncapped 8–10h replay until the yield path is proven at that scale. Offline help copy **shipped** (Tier S). Steal challenge-map modifiers and automation framing; **skip** monetization patterns entirely. |


---

### 4.14 The Perfect Tower II — Power Plant (Beacon Games)


|                     |                                                                                                                                                |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Link**            | [Steam](https://store.steampowered.com/app/1197260/The_Perfect_Tower_II/) · [Power Plant wiki](https://www.perfecttower2.com/wiki/Power_Plant) |
| **Type**            | Embedded grid minigame inside a massive idle tower-defense / town sim                                                                          |
| **Role in lineage** | Hidden gem — full spatial power-grid optimizer nested inside an unrelated genre                                                                |


**Design principles**

- **Grid placement on constrained tiles** — pumps, boilers, turbines, batteries, and late-game fission components occupy a shared spatial footprint.
- **Adjacency & topology rules** — pipe networks form connected graphs; separating grids (e.g., via gas tanks) avoids throughput bottlenecks — same mental model as heat-path planning.
- **Heat vs. power (fluid metaphor)** — water → steam → power chain; fission tiers add uranium boxes and reactors with escalating steam/heat demand.
- **Incremental payoff** — generated power accelerates other town buildings; optimization directly speeds the macro idle loop.
- **10 ticks/sec simulation** — discrete tick cadence familiar to reactor players.

**Steal**

- **Boost routing as reward** — power stored in batteries, spent selectively to speed target buildings (stagger boosts vs. dump-all).
- **Shareable layout codes** — community paste strings for endgame pipe/fission layouts (GitHub guides, Steam workshops).
- **Embedded "expert mode"** — a deep spatial puzzle optional inside a broader game — model for Revival challenge scenarios without abandoning core loop.

**Skip**

- Logarithmic/diminishing returns on huge grids without in-game explanation — players rely on external guides.
- Scope creep — Power Plant is one building among dozens; IC2 homage is late-game, not the onboarding hook.

**Hooks, friction & secret sauce**


|                         |                                                                                                                                                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Psychological hook**  | **Discovery delight.** Players who expected a tower idle stumble into a full factory/reactor grid optimizer — surprise depth drives guide culture and Discord theorycraft.                                   |
| **Friction point**      | **Cognitive cliff.** Boost mechanics, pipe grid separation, and tier upgrades are poorly tutorialized; community wikis required for "mental midget" moments (Steam discussions).                             |
| **Secret sauce**        | **Spatial throughput puzzles.** Separating pipe networks to hit exact turbine counts mirrors IC2 adjacency optimization — optimization itch without leaving the parent game.                                 |
| **Revival application** | Optional **scenario modes** (timed power quotas, boost budgets) inspired by PT2's town integration. Surface topology rules in-engine (§2 Transparent Topologies) so pipe-separation tricks aren't wiki-only. |


---

### 4.15 Factory Idle


|                     |                                                                             |
| ------------------- | --------------------------------------------------------------------------- |
| **Link**            | [factoryidle.com](https://factoryidle.com/)                                 |
| **Type**            | Browser idle factory sim — grid-constrained production chains               |
| **Role in lineage** | Same optimization muscle as reactor incrementals, different industrial skin |


**Design principles**

- **Grid placement under hard spatial limits** — every belt, furnace, and assembler consumes footprint; expansion is the primary prestige vector.
- **Adjacency-driven throughput** — inputs, processing, and outputs must align spatially; bottlenecks are topological, not just numeric.
- **Incremental scaling** — start tiny, automate, expand grid, reset/prestige into faster loops.
- **Heat vs. throughput analog** — not nuclear heat, but "pressure" from congestion, power draw, and line starvation punishes sloppy layouts.

**Steal**

- **Footprint as progression gate** — grid size upgrades feel like RI's 3×3 → 4×4 paradigm shifts (§4.4 Cascading Obsolescence).
- **Browser-native, instant iteration** — tweak-reset-observe loop without install friction (Knockoff lesson, §4.5).
- **Production-chain objectives** — timed quotas as optional challenge templates.

**Skip**

- Full factory sim scope — belts, fluids, and multi-product routing dilute reactor identity if ported wholesale.
- Late-game spreadsheet optimization without visual overlays — same Spreadsheet Wall trap (§2).

**Hooks, friction & secret sauce**


|                         |                                                                                                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Psychological hook**  | **Satisfying spatial chain completion.** Watching ore flow through a compact, hand-tuned grid triggers the same "machine works" dopamine as a stable Net-0 reactor. |
| **Friction point**      | **Mid-game opacity.** Effective ratios and bottleneck cells hide in dense grids; players export layouts to Discord or stop optimizing.                              |
| **Secret sauce**        | **Constraint breeds creativity.** Brutal footprint limits force non-obvious layouts — the same "elegant compact design" culture as MauveCloud leaderboard builds.   |
| **Revival application** | Borrow **footprint-scarce design challenges** for objectives (e.g., "max EP in 6×6"). Do not import factory mechanics — reuse the *pacing* of spatial scarcity.     |


---

### 4.16 NuclearCraft Reactor Planner — nc-reactor-generator (ThizThizzyDizzy)


|                     |                                                                                                                                                                                                                            |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Link**            | [GitHub](https://github.com/ThizThizzyDizzy/nc-reactor-generator) · [Releases](https://github.com/ThizThizzyDizzy/nc-reactor-generator/releases) · [Multiplatform fork](https://github.com/ThizThizzyDizzy/nc-planner-twd) |
| **Type**            | Desktop Java planner/simulator for the NuclearCraft Minecraft mod (actively maintained)                                                                                                                                    |
| **Role in lineage** | Successor to Hellrage's planner (on hiatus) — IC2 planners taken to 3D multiblock extremes                                                                                                                                 |
| **Predecessor**     | [Hellrage NC-Reactor-Planner](https://github.com/hellrage/NC-Reactor-Planner) — development paused; repo directs users here                                                                                                |


**Design principles**

- **3D multiblock grid** — reactors are volumes, not flat inventories; placement depth adds combinatorial complexity.
- **Hyper-specific adjacency rules** — coolers activate only with exact neighbor counts (e.g., Redstone cooler adjacent to exactly one fuel cell).
- **Fuel-type permutations** — isotopes, reflectors, and moderators each rewrite the optimization surface.
- **Simulation-first** — draw, tick, iterate without world risk; export/generate designs back to Minecraft.
- **Pre/overhaul mechanic toggles** — version drift managed in-tool across NC mechanic eras.
- **Active maintenance** — 100+ releases; standard desktop (Java) and multiplatform (`nc-planner-twd`) variants.

**Steal**

- **Rule transparency panels** — show *why* a component is active/inactive based on neighbor census (extends our heat-flow overlays).
- **Design comparison** — A/B two layouts on the same tick stats table (MauveCloud parity, §11 Phase B).
- **Versioned mechanic flags** — when we add parts, blueprint simulator must declare which ruleset it targets.
- **Long-lived planner stewardship** — explicit successor handoff when maintainers step back (Hellrage → Thiz model for community tools).

**Skip**

- 3D multiblock UI complexity — Revival identity is a readable 2D grid (§2 Abstraction Drift guardrail).
- Java desktop install path — browser planner wins for our audience.

**Hooks, friction & secret sauce**


|                         |                                                                                                                                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Psychological hook**  | **Sudoku-at-scale.** Players treat valid cooler adjacency as logic puzzles — satisfaction from a "legal" high-efficiency core.                                                       |
| **Friction point**      | **Rule encyclopedia burden.** Dozens of cooler types with unique neighbor predicates → wiki dependency unless the tool teaches inline.                                               |
| **Secret sauce**        | **Depth without RNG + living toolchain.** Every tick outcome is deterministic from placement; continuous releases keep pace with NC overhaul mechanics so theorycraft stays in-game. |
| **Revival application** | Inline **adjacency debugger** (highlight active/inactive parts and unmet neighbor rules). Keep 2D but steal NC's "explain the rule failure" UX for EP weave and reflector cells.     |


---

### 4.17 Big Reactors / Extreme Reactors Simulator (sidoh)


|                     |                                                                                |
| ------------------- | ------------------------------------------------------------------------------ |
| **Link**            | [br.sidoh.org](https://br.sidoh.org/)                                          |
| **Type**            | Browser planner for Big Reactors / Extreme Reactors (Minecraft mods)           |
| **Role in lineage** | Massive-grid coolant/rod optimization — IC2 spatial itch at reactor-yard scale |


**Design principles**

- **Volumetric reactor design** — length × width × height interior filled with fuel, control rods, and coolants.
- **Coolant flow optimization** — Cryotheum, Enderium, and other fluids change efficiency curves; layout is a heat-extraction puzzle.
- **Control rod insertion slider** — live tradeoff between output and efficiency; "Optimize" finds peak operating point.
- **Actively cooled vs passive** — mode switch changes the entire design meta.
- **Deterministic simulate** — RF/t, mb/t, and efficiency metrics without entering Minecraft.

**Steal**

- **One-click optimize** for steady-state rod insertion (analog: auto-suggest vent/exchanger ratios in blueprint mode).
- **Space-efficiency metrics** — RF/block and mb/block leaderboard culture → our EP/tile or power/tile analytics.
- **Shareable URL state** — reactor dimensions + layout encoded in hash (deep-link designs).

**Skip**

- 3D yard-scale reactors — out of scope for Revival's tile grid.
- Modpack-specific material IDs — keep our data-driven `part_list.json` authoritative.

**Hooks, friction & secret sauce**


|                         |                                                                                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Psychological hook**  | **Engineer's sandbox.** Building the biggest efficient reactor is a status symbol — br.sidoh links circulate like MauveCloud pastes. |
| **Friction point**      | **Dimension soup.** Interior vs. casing counts, modpack variants, and coolant names overwhelm newcomers.                             |
| **Secret sauce**        | **Interactive control rod slider + Optimize** — instant feedback loop for "what if I throttle here?" without rebuilding.             |
| **Revival application** | Blueprint **what-if slider** for heat venting tiers or cell duty cycles before apply. Encode shareable blueprint URLs (§11 Phase B). |


---

### 4.18 Cell Machine — Mystic Mod (Sam Hogan / community)


|                     |                                                                                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Link**            | [Mystic Mod (itch.io)](https://themysticlynx.itch.io/cell-machine-mystic-mod) · [Original GMTK jam entry](https://samhogan.itch.io/cell-machine) |
| **Type**            | Cellular-automata sandbox puzzle (browser/desktop)                                                                                               |
| **Role in lineage** | Adjacent genre — adjacency rules and emergent loops without incremental economy                                                                  |


**Design principles**

- **Grid placement, then simulation** — set initial conditions, press play, no mid-run control ("Out of Control" jam theme).
- **Typed cells with local rules** — Generators, Rotators, Movers, Enemies interact only with neighbors; global behavior emerges from micro-rules.
- **Adjacency as grammar** — rotators affect orthogonal neighbors; generators clone from behind — same spatial reasoning as reflector/vent placement.
- **Level editor + export** — community shares machine designs as paste strings.
- **Loop closure goal** — build self-sustaining engines that clear enemies or run infinitely (Infinite Human Paradox-style contraptions).

**Steal**

- **Emergent loop "activation moment"** — first time a machine runs cleanly → strong dopamine (pair with our tick audio, §4.4).
- **Sandbox after mastery** — post-campaign creative mode mirrors blueprint sandbox (§2 Mega Sauce #2).
- **Export/import codes** for community puzzles — optional player-made challenge layouts.

**Skip**

- Real-time CA simulation as core loop — Revival needs deterministic economic ticks, not emergent chaos.
- Combat/enemy cells — off-brand unless framed as scenario hazards.

**Hooks, friction & secret sauce**


|                         |                                                                                                                                                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Psychological hook**  | **Watch your machine run.** Zero input after "play" — pure spectator satisfaction when adjacency clicks.                                                                                                      |
| **Friction point**      | **Opaque emergent failures.** One wrong rotator breaks the loop; debugging means stepping through CA rules mentally.                                                                                          |
| **Secret sauce**        | **Minimalist rules → maximal complexity.** Nine cell types spawned a modding community and 1.5M-view dev video — proof that tight adjacency grammars sustain depth.                                           |
| **Revival application** | Optional **puzzle scenarios** with fixed part budgets (Net-0 heat in N ticks). Steal "press play to validate" UX for blueprint stability checks — already partially shipped (`#blueprint_planner_stability`). |


---

### 4.19 SpaceChem (Zachtronics)


|                     |                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------ |
| **Link**            | [Steam](https://store.steampowered.com/app/92800/SpaceChem/)                         |
| **Type**            | Commercial grid-based logic puzzle (reactor pipelines as programming)                |
| **Role in lineage** | Genre grandfather — spatial optimization with cycle/throughput "efficiency" pressure |


**Design principles**

- **Dual reactor grids** — input atoms bonded and split across paired pipelines; synchronization is the puzzle.
- **Spatial programming** — arrows, bonders, and sync points replace code; layout *is* the algorithm.
- **Cycle-count scoring** — heat-analog: faster cycles = better; leaderboards reward compact, fast machines.
- **No RNG in solutions** — deterministic atom paths; same inputs → same outputs.
- **Escalating part vocabulary** — new instructions force layout rewrites (Cascading Obsolescence, §4.4).

**Steal**

- **Cycle/time analytics** — show ticks-to-steady-state and ticks-to-meltdown in blueprint mode (MauveCloud parity).
- **Production-graph visualization** — optional overlay of power/heat flow as "atom paths" for EP weave tutorials.
- **Puzzle-world structure** — isolated scenarios with fixed tools before sandbox (objectives/chapters alignment).

**Skip**

- Programming-puzzle framing — our audience expects reactor metaphors, not WALDO instructions.
- Dual-grid sync complexity early — RI/Knockoff teach single-grid first for good reason.

**Hooks, friction & secret sauce**


|                         |                                                                                                                                                                  |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Psychological hook**  | **Intellectual status.** Completing SpaceChem puzzles signals engineering competence — leaderboard and screenshot sharing as social proof.                       |
| **Friction point**      | **Brutal difficulty spike.** No gentle incremental curve — abrupt wall drives players to walkthroughs (Spreadsheet/Wiki Wall variant).                           |
| **Secret sauce**        | **Spatial code elegance.** A five-instruction loop that solves the puzzle feels like poetry — the same compact-layout pride as a minimal RI EP farm.             |
| **Revival application** | **Scenario leaderboards** with deterministic scoring (EP/tick, time-to-stable). Teach advanced mechanics via phased puzzle objectives, not SpaceChem-hard jumps. |


---

### 4.20 Gridland (doublespeak games)


|                     |                                                                                                                      |
| ------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **Link**            | [Play](https://gridland.doublespeakgames.com/) · [Press kit](https://press.doublespeakgames.com/gridland/index.html) |
| **Type**            | Browser match-3 + survival RPG with day/night build phases                                                           |
| **Role in lineage** | Minimalist web math aesthetic shared with RI/Knockoff — spatial resource loop without nuclear skin                   |


**Design principles**

- **Grid as core interaction surface** — all resources come from tile matches on a shared board.
- **Phase-shift pacing** — day: build/gather; night: defend — forces alternating optimization targets.
- **Minimal UI, maximal math** — no text-heavy tutorials (studio's post–A Dark Room philosophy); systems taught by play.
- **Incremental town growth** — structures unlock new tile types and abilities; reset loops via nightly pressure.
- **Browser-first, offline-capable mobile sequel** — Super Gridland extended the loop to app stores.

**Steal**

- **Phase-based objective framing** — "optimize power layout before nightfall" style timed chapters.
- **Wordless onboarding** — mechanics through phased pressure, not modal walls (§4.10 inverse lesson).
- **Monochrome → color unlock** — visual progression signaling new systems (our heat-tier color language).

**Skip**

- Match-3 core loop — unrelated to reactor placement; only borrow pacing/UX patterns.
- Night combat as mandatory loop — would dilute optimization focus.

**Hooks, friction & secret sauce**


|                         |                                                                                                                                                                |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Psychological hook**  | **Tension rhythm.** Day planning vs. night survival creates heartbeat pacing — optimization has a deadline.                                                    |
| **Friction point**      | **Opaque night scaling.** Players die without understanding which day-phase choices caused failure — wiki/recipe hunting.                                      |
| **Secret sauce**        | **Web-native minimalism.** Instant load, no install, serious math beneath cute pixels — same delivery model as Knockoff/Revival PWA.                           |
| **Revival application** | **Timed challenge chapters** with clear fail-forward telemetry (what heat threshold triggered meltdown). Keep wordless toasts over VN modals (§2 Friction #8). |


---

## 5. Progression & Pacing Archetypes

To build a better progression model, we analyzed how previous games handled the mid-to-late game.


| Archetype                   | How they handled it                            | Why it failed / succeeded                                                                         | Revival application                                              |
| --------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| **The Linear Grind**        | Multiply part costs by 1.5× endlessly          | **Failed:** Boring. Layouts stagnate; you just wait longer.                                       | Use dynamic topology changes (grid expansion, new cell shapes).  |
| **The Paradigm Shift**      | Introduce a completely new mechanic (e.g., EP) | **Succeeded:** Forces the player to delete their old "Power" layout and build a "Heat/EP" layout. | Our EP Weave requires balancing heat removal and power.          |
| **The Automation Hand-off** | Upgrades buy the player out of manual clicks   | **Succeeded:** Relieves RSI, makes the player feel like a boss.                                   | Auto-sell, Auto-buy, and Heat-control operators are P0 features. |


---

## 6. UI/UX Paradigm Analysis: Managing Cognitive Overload

Reactor games are essentially data visualization tools. Previous games failed when they overwhelmed the user.

### Data density vs. clarity

- **Previous flaw:** Hiding crucial stats (like effective transfer rates) behind tooltips.
- **Revival fix:** Implement the **Heat Flow Overlay** and **Heat Map Overlay**. Allow the player to toggle visual layers that map math directly onto the grid (e.g., animated arrows showing exactly where heat is bottlenecking).

### The "Meltdown" UX

- **Previous flaw:** A tiny red bar fills up, and suddenly everything vanishes.
- **Revival fix:** Phased visual feedback. 80% (Warning LED) → 100% (Saturation, UI shaking) → 110% (Repulsion, CRT tearing) → Meltdown. Give the player visceral warning time — IC2's **tactile panic** via durability/degradation visuals (§4.1 secret sauce).
- **Shipped:** `failure_flavor.json` + failure-state banner; chapter flavor toasts.
- **Open:** CRT screen shake, warning klaxons, volatile heat-bar styling before total failure.

### Sensory feedback & "activation" moments

- **RI secret sauce:** Tick-cadence audio as subconscious ASMR loop — keep `audio.sys.js` bound to simulation rhythm (§4.4).
- **Radioactive Idle secret sauce:** Rippling visual celebration on big surges — enhance `ui-heat-visuals.js` for EP weave / power milestones without breaking determinism (§4.8).
- **Navalty secret sauce:** Diegetic Sovietwave workstation — `ui-idle-effects.css` and ambient hum as fantasy grounding, not decoration (§4.10).

### Offline return ("Morning Coffee" moment)

- **Mobile tycoon secret sauce:** Opening the app after sleep should feel like a curated reward spree (§4.13).
- **Revival fix:** Welcome-back modal must show exactly what was accomplished; `processOfflineTime` must stay mathematically exact. Offline help copy **shipped** (Tier S).

---

## 7. Cross-Project Design Principles Matrix


| Principle                 | IC2 | Planners | RI  | Knockoff | Revival | Best exemplar        |
| ------------------------- | --- | -------- | --- | -------- | ------- | -------------------- |
| Spatial adjacency puzzles | ●   | ●        | ●   | ●        | ●       | IC2 + RI             |
| Heat ≠ power scaling      | ●   | ●        | ●   | ●        | ●       | Revival (documented) |
| Shareable layouts         | ○   | ●        | ○   | ●        | ◐       | Planners + Knockoff  |
| Tick-level analytics      | ○   | ●        | ○   | ○        | ◐       | MauveCloud           |
| Prestige / EP meta        | ○   | ○        | ●   | ●        | ●       | RI                   |
| Offline / catchup         | ○   | ○        | ●   | ○        | ●       | RI + Revival         |
| PWA / installable         | ○   | ○        | ○   | ○        | ●       | Revival              |
| Worker physics            | ○   | ○        | ○   | ○        | ●       | Revival              |
| Schema-validated saves    | ○   | ○        | ○   | ○        | ●       | Revival              |
| Objectives / tutorial     | ○   | ○        | ◐   | ○        | ●       | Revival              |
| Cloud save                | ○   | ○        | ●   | ○        | ○       | RI                   |
| Macros / bulk edit        | ○   | ◐        | ●   | ◐        | ◐       | RI                   |
| Multi-reactor network     | ○   | ○        | ○   | ○        | ○       | Redux                |
| Narrative tension         | ○   | ○        | ◐   | ○        | ◐       | Navalty              |
| Achievements              | ○   | ○        | ◐   | ○        | ○       | Radioactive Idle     |
| i18n                      | ○   | ●        | ○   | ○        | ○       | MauveCloud           |
| Leaderboard               | ○   | ○        | ●   | ○        | ●       | RI + Revival         |


Legend: ● strong · ◐ partial · ○ weak/absent

---

## 8. Reactor Revival — Current Baseline (internal)

Use this when weighing imports — **do not re-implement what we already have.**


| Capability                                       | Implementation touchpoints                                           |
| ------------------------------------------------ | -------------------------------------------------------------------- |
| Pulse physics                                    | `logic.js`, `logic-topology.js`, `kernel/physics.js`, workers        |
| Heat pressure batch step                         | `logic-heat-transfer.js`, `runHeatStepFromTyped`                     |
| Blueprint copy/paste + planner preview           | `ui-copy-paste.js`, `domain/blueprint.js`                            |
| Blueprint stability label (Stable / Net heating) | `ui-copy-paste.js`, `#blueprint_planner_stability`                   |
| Offline catchup                                  | `engine-game-loop.js`, `processOfflineTime`                          |
| Prestige / EP / weave quantum                    | `domain/game.js`, prestige modals, `help_text.json`                  |
| Objectives + chapters                            | `objective_list.json`, `logic/objective-controller.js`               |
| Difficulty curves / challenge modes              | `difficulty_curves.json`, game setup cards                           |
| Failure-phase flavor                             | `failure_flavor.json`, `failureFlavor.js`, `#failure_warning_banner` |
| In-app changelog / What's New                    | `changelog.json`, `services-pwa.js`, Settings Data tab               |
| Save export/import UX                            | Settings modals, `.reactor` handler, Help + chapter toast            |
| PWA + SW                                         | `services-pwa.js`, Workbox, `manifest.json`                          |
| Leaderboard + local best                         | `services-leaderboard.js`, outbox                                    |
| Data-driven parts/upgrades                       | `public/data/*.json`, Zod schemas                                    |
| Test gate                                        | Vitest `tests/core/`**, UI screenshots                               |
| Architecture migration                           | Phase 2 rules — domain/state/logic split                             |


---

## 9. Revival Friction Audit — Live Gaps

Codebase review mapping **current Reactor Revival friction** against Mega Sauces (§2) and Absolute Avoids (§2). Includes competitor-derived gaps and **interaction/mechanics audits** from live code paths.

### UI / UX


| #   | Live friction                               | Violates                                               | Evidence                                                                                                                                                                  | Fix                                                                                                                   |
| --- | ------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 1   | **The "Blind Prestige" Gamble**             | Friction #1 (Wiki Wall) · Mega Sauce #3                | **Fixed** — `prestigeModalTemplate` now displays `epFromWeave` and expected money multiplier.                                                                             |                                                                                                                       |
| 2   | **All-or-Nothing Blueprint Apply**          | Mega Sauce #2 · Friction #2 (Punitive Experimentation) | **Fixed** — Blueprint apply now uses `applyBlueprintLayoutDiff` with partial placement affordances and deficit toasts.                                                    |                                                                                                                       |
| 8   | **The "Time Flux" Offline Gamble**          | Mega Sauce #4 · Friction #6                            | **Remediated (P0):** analytical `runInstantCatchup()` removed; Fast-Forward via worker; catch-up earnings notice after replay. **Open:** meltdown projection before modal | Run silent `postGameLoopProjectionQuery()` before welcome-back modal                                                  |
| 10  | **The Unforgiving Miss-click**              | Friction #2 (Punitive Experimentation)                 | Expensive part placed on wrong tile deducts full cost; sell-back uses degraded `calculateSellValue()` — no undo                                                           | Confirm-placement ghost for EP parts or >20% bankroll; or 5s undo with 100% refund                                    |
| 17  | **The "Hidden Carrot" (Goal Obfuscation)**  | Friction #5 (Wait Wall) · Progression                  | **Remediated (P0):** `hideUnaffordableUpgrades` and `hideUnaffordableResearch` default **false**                                                                          | Unaffordable items visible but greyed out                                                                             |
| 19  | **"Wait, Did That Work?" UI Silence**       | Friction #4 (Opaque Math) · UX trust                   | **Fixed** — Insufficient funds enqueues floating text `[Not enough funds!]` at cursor location.                                                                           |                                                                                                                       |
| 20  | **EP Scaling Opacity (The Secret Divisor)** | Friction #1 (Wiki Wall) · Mega Sauce #3                | **Fixed** — `prestigeModalTemplate` shows `epFromWeave` with explicit `Min(Power, Heat) / WEAVE_QUANTUM` divisor (`constants/balance.js`) |                                                                                                                       |


### Platform UX


| #   | Live friction                        | Violates                       | Evidence                                                                                                                                | Fix                                                                                    |
| --- | ------------------------------------ | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 3   | **Mobile Bulk-Placement Exhaustion** | Friction #7 (Micro-Management) | **Fixed** — Mobile drag-to-build and Macro toolbar fully operational.                                                                   |                                                                                        |
| 7   | **UI Claustrophobia on Mobile**      | Mega Sauce #7 (Visual Math)    | `reactor-mobile.css` stacks URL bar → passive top bar → grid → quick-select → control deck → bottom nav; grid becomes a small letterbox | **Zen / Immersive Mode** — collapse non-essential chrome into hamburger while building |


### Mechanics & Simulation


| #   | Live friction                                       | Violates                                | Evidence                                                                                                                                       | Fix                                                                                                       |
| --- | --------------------------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| 4   | **Fatal Meltdowns Erase Unsaved Layouts**           | Friction #2 · Friction #6  | **Fixed** — `executeMeltdown()` always calls `saveRecoveredBlueprint()` before tile clear; layout lands in My Layouts as Recovered Blueprint |                                                                                                           |
| 5   | **The "Extreme Vent" Death Spiral**                 | Friction #4 (Opaque Math) · Friction #6 | **Fixed** — `powerVentScram` implemented in worker kernel; cells SCRAM (0 heat, 0 power) if power drops below active vent demand.              |                                                                                                           |
| 6   | **Opaque Pressure-Gradient Math**                   | Friction #1 · Mega Sauce #7             | **Fixed** — Tooltips now display dynamic pressure flow status (e.g., *"Blocked: your 85% ≤ neighbor 90%"*) via `inspectExchangerPressureFlow`. |                                                                                                           |
| 11  | **Blueprint Lacks N-Tick Steady-State**             | Mega Sauce #2                           | **Fixed** — `requestBlueprintProjectionSample` queries the worker for N-tick warmup and sample averages.                                       |                                                                                                           |
| 18  | **"Blind" Blueprint Application (Replacement Tax)** | Friction #2 · Mega Sauce #2             | **Fixed** — Diff-based replacement implemented via `computeBlueprintDiff`.                                                                     |                                                                                                           |
| 21  | **Overlapping Bar Clutter**                         | Mega Sauce #7 (Visual Math)             | **Fixed** — `DynamicOverlayRenderer` spatially separates bars: durability at the bottom, heat at the top (`y + 1`) if durability exists.       |                                                                                                           |
| 22  | **The "False Positive" Heat Panic**                 | Friction #6 · Mega Sauce #1             | **Fixed** — `isHeatNetBalanced` caps visual danger at `0.5` (amber) if net heat is ≤ 0, suppressing alarm fatigue.                             |                                                                                                           |
| 23  | **"Where Did My Money Go?" (Auto-Buy Opacity)**     | Friction #7 · Mega Sauce #8             | **Fixed** — Worker dispatches `autoBuyEvents` back to main thread to trigger `-$[cost]` floating debit text over replaced tiles.               |                                                                                                           |
| 25  | **Directional Misdirection (Valve Placement)**      | Friction #1 · Mega Sauce #7             | **Fixed** — Directional SVG arrows are drawn natively on valve tiles.                                                                          |                                                                                                           |
| 26  | **Stirling Generator Gaslighting**                  | Friction #4 (Opaque Math)               | **Fixed** — `stats_stirling_power` is added to total, and explicitly broken out in the UI tooltip (`Power: [X] (Cells) + [Y] (Stirling)`).     |                                                                                                           |


### Progression & Community


| #   | Live friction                             | Violates                           | Evidence                                                                                                                                    | Fix                         |
| --- | ----------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| 9   | **Objective Railroading**                 | Friction #8 (Pacing Interruptions) | **Fixed** — All objectives evaluate via state-based interval checks in `constants/objectives.js`.                                           |                             |
| 12  | **No Share Codes or Layout Diff**         | Mega Sauce #5                      | **Fixed** — Layout codec uses `rr1:` versioned base64 prefix, and A/B compare modal visualizes diffs.                                       |                             |
| 13  | **Leaderboard Layouts Aren't Actionable** | Mega Sauce #5                      | **Fixed** — Leaderboard entries with layouts feature "View" and "Load to Grid" actions.                                                     |                             |
| 14  | **Meltdown Phased Sensory Incomplete**    | Friction #6                        | **Fixed** — `updateFailurePhaseSensory` and `audio-warning-manager.js` fully implement phased CRT shaking, tearing, and escalating klaxons. |                             |
| 15  | **No Surge / Weave Celebration VFX**      | Mega Sauce #6                      | **Fixed** — Deterministic `fx-ep`, `fx-power`, and `fx-heat` animations trigger off worker tick thresholds in `ui-heat-visuals.js`.         |                             |
| 16  | **Cloud Save Dead-End Stub**              | Mega Sauce #4 · RI parity          | `#setting-cloud-saves { display: none }` in `uiModalTemplates.js`                                                                           | Ship backend or remove stub |
| 24  | **Unforgiving Save-Slot Overwrites**      | Friction #2 · Mega Sauce #4        | **Fixed** — Autosaves are isolated to `AUTOSAVE_SLOT_KEY` protecting manual save slots 1-3.                                                 |                             |


**Priority rollup**


| Priority | §9 rows   |
| -------- | --------- |
| **P0**   | 8         |
| **P1**   | 7, 10, 17 |
| **P2**   | 16        |


**Audit notes**

- Tier S mitigations **reduce** wiki/sudden-death pain; weave divisor (#20) and recovered-blueprint meltdown (#4) are **shipped**.
- Hot-part sell degradation (`grid.js` `calculateSellValue`) is **intentional RI parity** — mitigate via blueprint diff (#18), partial apply (#2), and undo (#10), not removal.
- `#8` welcome-back meltdown projection remains the primary **P0** trust gap before Fast-Forward.
- `#5` and `#6` simulation-trust issues are **remediated** (vent SCRAM, pressure-flow tooltips).
- Re-run this audit after undo (#10), welcome-back projection (#8), or mobile immersive mode (#7) ship.

---

## 10. Gap Analysis (prioritized — V2 model)

### P0 — Trust & Foundation (The Anti-Frustration Layer)


| #   | Item                                                                                                    | Status    | Notes                                                                                                        |
| --- | ------------------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------ |
| 1   | **In-game blueprint analyzer** — draft layout, see steady-state Output/Heat/Tick without spending money | ● Shipped | Worker N-tick sandbox, partial affordability placement, diff-based apply.                                    |
| 2   | **Cloud/local save portability** — prominent Export/Import via `.reactor` files                         | ◐ Partial | Export/import + Help + Settings **shipped**; optional cloud backend still open                               |
| 3   | **Macro placement UX** — row/col fill, area clear                                                       | ● Shipped | Hotkeys and mobile popover toolbar fully implemented via `input-manager.js`.                                 |
| 4   | **Prestige onboarding guide** — explicit path to first ~51 EP reboot                                    | ◐ Partial | Help + objectives + prestige modal weave math **shipped**; first-reboot objective path still open |
| 5   | **In-app changelog** tied to PWA updates                                                                | ● Shipped | CI-generated `changelog.json`, update toast, Settings "Recent Changes"                                       |


### P1 — The "Architect" Transition (Pacing & Progression)


| #   | Item                                                                         | Status    | Notes                                                                                        |
| --- | ---------------------------------------------------------------------------- | --------- | -------------------------------------------------------------------------------------------- |
| 6   | **Steady-state analyzer** — run N ticks in sandbox, report avg power/heat/EP | ● Shipped | `requestBlueprintProjectionSample()` added                                                   |
| 7   | **Dynamic contextual tooltips** — effective stats based on adjacency         | ● Shipped | Adjacency math (`M + N`) calculated dynamically for tooltips via `formatCellSubstrateLines`. |
| 8   | **Layout diff / A-B compare**                                                | ● Shipped | Compare modal added                                                                          |
| 9   | **CSV / JSON tick export**                                                   | ● Shipped | CSV & JSON tick array export in planner                                                      |
| 10  | **Compact share codes**                                                      | ● Shipped | `rr1:` versioned base64 prefix codec                                                         |


### P2 — Retention, Lore & Community


| #   | Item                                                  | Status    | Notes                                                                                             |
| --- | ----------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------- |
| 11  | **Achievement layer**                                 | ◐ Partial | 25 achievements in `achievement_list.json`; pure evaluators; unlock toasts via `effect_queue` |
| 12  | **Challenge scenarios** — daily/weekly seeded layouts | ◐ Partial | Easy/medium/hard at new game **shipped**                                                          |
| 13  | **Heat zone summaries**                               | ○ Open    | Facility-idler inspired aggregates                                                                |
| 14  | **Failure/success flavor text**                       | ● Shipped | `failure_flavor.json`, chapter flavor toasts (Tier S)                                             |
| 15  | **Leaderboard layout codes**                          | ● Shipped | Leaderboard layout column includes both "View" and "Load to Grid" actions via blueprint pipeline. |
| 16  | **Community gallery**                                 | ○ Open    | Phase E3                                                                                          |


### P3 — Expansion (only after 1.0)

1. **Secondary grid / heat bus network** (Redux-inspired).
2. **i18n** — string tables; community translations.
3. **Optional "City demand" scenario** — timed power quotas.

---

## 11. Synthesis Plan — "Best of All Projects"

### Design tenets (non-negotiable)

1. **Simulation first** — any feature must preserve deterministic ticks and test coverage.
2. **Data over code** — parts, upgrades, objectives stay JSON + schema validated.
3. **Planner parity** — if a player can do it live, they can simulate it offline in blueprint mode.
4. **No pay-to-win** — learn from mobile tycoons' retention, not their monetization.
5. **Strangler architecture** — one module per commit; `npm test` green (Phase 2 rules).
6. **Anti–Spreadsheet Wall** — every mechanic that sent players to wikis or external tools must have an in-engine teaching or simulation path (§2 Mega Sauces / Frictions).
7. **Friction audit gate** — before shipping UX/sim changes, check against §9 live gaps and close or document regressions.

---

### Phase A — Foundation (in progress)

**Goal:** Clean architecture enables faster feature imports.


| Work                        | Source inspiration                | Exit                                                 |
| --------------------------- | --------------------------------- | ---------------------------------------------------- |
| Complete domain/state split | Knockoff Enhanced *anti-pattern*  | No import cycles; files < 1,500 lines                |
| Stable public barrels       | RI modding community expectations | Tests pass via `@app/logic.js` until final migration |


*Already tracked in `.cursor/rules/phase-2-architecture.mdc`.*

---

### Phase B — Planner & analytics (MauveCloud + Talonius)

**Goal:** Best browser-based reactor theorycraft tool — in-engine theorycrafting pillar (§2).


| #   | Deliverable                         | Acceptance criteria                                     |
| --- | ----------------------------------- | ------------------------------------------------------- |
| B1  | Sandbox tick runner in blueprint UI | **Shipped** — isolated worker simulation path           |
| B2  | Steady-state report                 | **Shipped** — returns averaged sample slice             |
| B3  | Export                              | **Shipped** — CSV and JSON exports available in planner |
| B4  | Share codec v1                      | **Shipped** — `rr1:` binary structure                   |
| B5  | A/B compare                         | **Shipped** — Compare modal with deltas                 |


**Design notes:** Reuse worker path where possible (`previewBlueprintPlannerStats` → full worker sandbox). Do not duplicate physics in planner thread.

---

### Phase C — Incremental parity (Reactor Incremental + Knockoff)

**Goal:** RI veterans feel at home within 30 minutes.


| #   | Deliverable         | Acceptance criteria                                               |
| --- | ------------------- | ----------------------------------------------------------------- |
| C1  | Macro toolbar       | Fill line/rect; optional checkerboard; undo last macro            |
| C2  | Save UX             | Prominent Export/Import + `.reactor` handler documented in Help   |
| C3  | Optional cloud save | Backend TBD: GitHub Gist, Drive API, or Supabase — encrypted blob |
| C4  | Prestige guide      | Objective or help panel for first reboot milestone                |
| C5  | What's New modal    | Shows on version change; linked from settings                     |


**Shipped:** C2 (Help + Settings), C4 (Help + objectives), C5 (changelog + Settings "Recent Changes").

---

### Phase D — Onboarding & retention (Revival + Radioactive + Navalty)

**Goal:** New players reach first prestige without wiki — defeat Wiki Dependency Trap (§2).


| #   | Deliverable                     | Acceptance criteria                                                                                               |
| --- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| D1  | Achievement set (~30)           | Tied to tutorial moments; no mandatory grind — **25 shipped** (`achievement_list.json` + `achievement-checks.js`) |
| D2  | Challenge modes                 | Easy/medium/hard + weekly seeded challenge                                                                        |
| D3  | Failure flavor                  | Meltdown / saturation uses failure-phase copy                                                                     |
| D4  | Optional "City demand" scenario | Time-limited power target; cosmetic reward                                                                        |


**Shipped:** D2 (difficulty presets at new game), D3 (failure flavor + chapter toasts), offline/layout/sell help copy (Tier S).

---

### Phase E — Community (RI leaderboard culture + Knockoff transparency)

**Goal:** Share builds, compare runs, trust balance patches.


| #   | Deliverable                               | Acceptance criteria            |
| --- | ----------------------------------------- | ------------------------------ |
| E1  | Leaderboard attaches optional layout code | Top runs reproducible          |
| E2  | GitHub Releases changelog                 | Player-readable balance notes  |
| E3  | Blueprint gallery page (static or API)    | Curated codes with attribution |


---

### Phase F — Optional expansion (Redux / mobile tycoon ideas)

**Defer until post-1.0 player feedback.**

- Sub-reactor slots linked by heat pipes
- Multiple site maps with regional modifiers
- i18n via extracted string table

---

## 12. Feature Decision Filter

Before building any imported idea, score 1–5:


| Question                                             | Weight  |
| ---------------------------------------------------- | ------- |
| Does it preserve deterministic simulation?           | Blocker |
| Does it reduce Spreadsheet Wall / wiki dependency?   | High    |
| Can it be data-driven (JSON/schema)?                 | High    |
| Does RI or MauveCloud planner do it well today?      | Medium  |
| Can we test it in Vitest without Puppeteer?          | High    |
| Does it fit single-reactor IC2 fantasy?              | Blocker |
| Does it violate §13.2 Revival lineage anti-patterns? | Blocker |


**Reject** if either blocker fails. **Defer** only for Phase F scope that explicitly reframes identity (rare).

---

## 13. Anti-Patterns Observed Across Projects

### 13.1 Cross-Project Anti-Patterns


| Anti-pattern                  | Category     | Seen in                  | Revival defense                                                                                                            |
| ----------------------------- | ------------ | ------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| **"Mystery Math"**            | Game Design  | Early RI                 | `core_principles.txt` math is transparent; tooltips should break down pulse heat `(M + N)²`                                |
| **Save file fragility**       | Tech         | Knockoff                 | Zod schema validation (`SaveDataSchema`) and automatic version migration                                                   |
| **"Dead" offline time**       | UX           | Base IC2                 | **Shipped (P0):** `startOfflineFastForward()` chunks offline ticks through worker at `WELCOME_BACK_FF_MAX_TICKS` per frame |
| **UI thread locking**         | Tech         | WebGL incrementals       | `engine.worker.js` handles grid physics; UI is a read-only projection (Valtio state)                                       |
| **Punitive UI resets**        | UX           | Various                  | Copy/paste/blueprint mode prevents destroying the grid to test a new exchanger layout                                      |
| Monolithic 5k+ line JS        | Architecture | Knockoff, early RI ports | Phase 2 splits                                                                                                             |
| Physics diverges UI vs worker | Tech         | Some forks               | Single `kernel/physics.js`                                                                                                 |
| Planner ≠ live sim            | Tech         | Some web planners        | Same worker code path                                                                                                      |
| Rewrite instead of migrate    | Architecture | knockoff-enhanced        | Strangler fig                                                                                                              |
| Feature creep → Redux scope   | Scope        | sequels                  | Phase F gate                                                                                                               |
| Opaque balance                | UX           | Mobile tycoons           | Public `part_list.json` + in-app changelog                                                                                 |
| **Wiki dependency**           | UX           | RI EP weaving            | Phased objectives + Help (`help_text.json`) — ongoing                                                                      |
| **Abstraction drift**         | Game Design  | Nuclear Power Idle       | Grid adjacency is non-negotiable identity                                                                                  |


### 13.2 Revival Lineage Violations (Audit Log)

These ten patterns **fundamentally contradict** the IC2/Reactor franchise identity. All rows **1–10** remediated. Use this table as a pre-ship audit checklist — not as a list of live defects.


| #   | Anti-pattern                              | Category         | Status    | Remediation applied                                                                             |
| --- | ----------------------------------------- | ---------------- | --------- | ----------------------------------------------------------------------------------------------- |
| 1   | **The "Welfare" Failsafe**                | Economy / Tone   | **Fixed** | Removed `FAILSAFE_MONEY_THRESHOLD` injection from `runSellAction()`                             |
| 2   | **Explosions as Cooling Strategy**        | Physics / Lore   | **Fixed** | Removed `explosive_decompression`; explosions always add contained heat to hull                 |
| 3   | **Autonomic Repair Violating Fuel Cycle** | Mechanics        | **Fixed** | Removed `handlerAutonomicRepair` fuel tick regeneration                                         |
| 4   | **Page-Routing the Grid Away**            | UX               | **Fixed** | Upgrades/Research use `shop-overlay-open` side panel; reactor stays visible; sim does not pause |
| 5   | **Global Multipliers Ignoring Topology**  | Design           | **Fixed** | `infused_cells`, `unleashed_cells`, `component_reinforcement` scoped by part category           |
| 6   | **Manual Clicking as Late-Game Strategy** | Pacing           | **Fixed** | `improved_piping` one-time 10×; `emergency_coolant` capped at 3 levels                          |
| 7   | **Blurring Component Taxonomy**           | Mechanics        | **Fixed** | `ceramic_composite` buffs plating hull heat — no transfer role                                  |
| 8   | **Analytical "Instant Catch-up"**         | Simulation Trust | **Fixed** | `runInstantCatchup()` removed; worker fast-forward chunked replay only.                         |
| 9   | **Infinite Generative Quests**            | Progression      | **Fixed** | Removed `INFINITE_CHALLENGES`; terminal state is curated `allObjectives`                        |
| 10  | **The "Ctrl+9" Production Cheat**         | Code Hygiene     | **Fixed** | Removed Ctrl+9 / Ctrl+E handlers from production UI                                             |


**Audit rule:** Before shipping upgrades, offline UX, or progression changes, scan against §13.2. If a feature matches a row, either rework it per **Remediation** or document an explicit identity exception in the PR.

---

## 14. 90-Day Execution Roadmap (V2 Focus)


| Phase                      | Focus area               | Key deliverables                                                                                                                                                                                          |
| -------------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Month 1: The Sandbox**   | In-engine theorycrafting | Ship blueprint mode with steady-state analytics. Implement macro tools (Fill/Clear). Ensure `previewBlueprintPlannerStats` matches live worker physics exactly in Vitest.                                 |
| **Month 2: The Cliff**     | Mid-game smoothing       | Contextual tooltips (dynamic adjacency math). Grid expansion that reshapes topology (RI cascading obsolescence). Achievement/prestige onboarding to guide players over the 50 EP wall.                    |
| **Month 3: The Community** | Export & shareability    | Finalize `.reactor` file handling. Compact, URL-linkable layout strings (planner community currency). Hook leaderboard to attach layout codes. Welcome-back UI polish for "Morning Coffee" return moment. |


**Key success metrics**


| Metric                   | Target                                                                                     |
| ------------------------ | ------------------------------------------------------------------------------------------ |
| **Blueprint adoption**   | >40% of mid-game players use blueprint planner before live grid changes                    |
| **Prestige funnel**      | Reduce drop-off between mid-game objectives and first EP prestige via in-game guidance     |
| **Zero math divergence** | UI projection, live worker, and blueprint sandbox yield identical tick output in Vitest CI |
| **Zero regression**      | `npm test` + deploy screenshot baseline green                                              |


*Prior v1 metrics retained:* new player → first reboot median ≤ RI wiki expectation (~2–4 hours skilled); planner session ≥20% of sessions (telemetry TBD).

---

## 15. References


| Project                                       | URL                                                                                                                                                                              |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reactor Revival (ours)                        | [https://jdial1.github.io/reactor-revival/](https://jdial1.github.io/reactor-revival/)                                                                                           |
| Reactor Incremental                           | [https://www.kongregate.com/games/Cael/reactor-incremental](https://www.kongregate.com/games/Cael/reactor-incremental)                                                           |
| Reactor Redux                                 | [https://www.kongregate.com/games/cael/reactor-redux](https://www.kongregate.com/games/cael/reactor-redux)                                                                       |
| Reactor Knockoff                              | [https://cwmonkey.github.io/reactor-knockoff/](https://cwmonkey.github.io/reactor-knockoff/)                                                                                     |
| Ic2Exp Reactor Planner                        | [https://github.com/MauveCloud/Ic2ExpReactorPlanner](https://github.com/MauveCloud/Ic2ExpReactorPlanner)                                                                         |
| Talonius IC² Reactor Planner                  | [https://forum.industrial-craft.net/thread/2147-new-reactor-planner-made-by-talonius/](https://forum.industrial-craft.net/thread/2147-new-reactor-planner-made-by-talonius/)     |
| NuclearCraft Planner (nc-reactor-generator)   | [https://github.com/ThizThizzyDizzy/nc-reactor-generator](https://github.com/ThizThizzyDizzy/nc-reactor-generator)                                                               |
| Hellrage NC Planner (superseded, hiatus)      | [https://github.com/hellrage/NC-Reactor-Planner](https://github.com/hellrage/NC-Reactor-Planner)                                                                                 |
| Big Reactors Simulator                        | [https://br.sidoh.org/](https://br.sidoh.org/)                                                                                                                                   |
| Reactor — Energy Sector Tycoon / Idle Reactor | [https://play.google.com/store/apps/details?id=com.rsgapps.reactor](https://play.google.com/store/apps/details?id=com.rsgapps.reactor)                                           |
| The Perfect Tower II                          | [https://store.steampowered.com/app/1197260/The_Perfect_Tower_II/](https://store.steampowered.com/app/1197260/The_Perfect_Tower_II/)                                             |
| Factory Idle                                  | [https://factoryidle.com/](https://factoryidle.com/)                                                                                                                             |
| Cell Machine — Mystic Mod                     | [https://themysticlynx.itch.io/cell-machine-mystic-mod](https://themysticlynx.itch.io/cell-machine-mystic-mod)                                                                   |
| SpaceChem                                     | [https://store.steampowered.com/app/92800/SpaceChem/](https://store.steampowered.com/app/92800/SpaceChem/)                                                                       |
| Gridland                                      | [https://gridland.doublespeakgames.com/](https://gridland.doublespeakgames.com/)                                                                                                 |
| Radioactive Idle                              | [https://nk.ax/radioactive/](https://nk.ax/radioactive/)                                                                                                                         |
| Nuclear Power Idle                            | [https://kamilgrajdev.itch.io/nuclear-power-idle](https://kamilgrajdev.itch.io/nuclear-power-idle)                                                                               |
| The Reactor                                   | [https://navalty.itch.io/the-reactor](https://navalty.itch.io/the-reactor)                                                                                                       |
| IC2 Old Reactor Mechanics                     | [https://wiki.industrial-craft.net/index.php?title=Old_Reactor_Mechanics_and_Components](https://wiki.industrial-craft.net/index.php?title=Old_Reactor_Mechanics_and_Components) |
| Internal design doc                           | `core_principles.txt`                                                                                                                                                            |
| Architecture migration                        | `.cursor/rules/phase-2-architecture.mdc`                                                                                                                                         |


---

## 16. Document Maintenance

- Re-run competitor pass **quarterly** or before major releases.
- Add a row to §4 when new reactor incrementals ship (search: incrementaldb, itch.io, Kongregate).
- When implementing a planned item, link the PR in §11 and update **Status** in §10.
- Re-run **§9 Friction Audit** after major UX/sim releases; close rows when evidence shows shipped remediation.
- v2.0+ shifts focus from feature checklists to the Design Model (§2); keep §10 status column current as Tier S/M items ship.
- Catalog deep-dives (§4) use **Hooks / Friction / Secret Sauce / Revival application** — extend that template when adding new competitor entries.
- **Mega Sauces (§2)** and **Absolute Avoids (§2)** are the definitive franchise checklist; §9 maps live codebase friction gaps, §13.2 maps live codebase **identity violations**.
- Re-run **§13.2 Lineage Audit** when touching economy failsafes, upgrade modifiers, offline catch-up, objectives, page routing, or keyboard shortcuts.

