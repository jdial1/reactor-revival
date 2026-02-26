# Reactor Revival: Complete Game Documentation

Welcome to the Reactor Revival documentation. This document provides comprehensive information about the game's architecture, data management, game mechanics, and UI/UX specifications.

## 1. System and Architecture

### 1.1. Overview
Reactor Revival is a modern, browser-based incremental game built with vanilla JavaScript, HTML5, and CSS3. It uses Break Infinity for arbitrary-precision numeric calculations. The architecture emphasizes modularity, performance, and maintainability through clear separation of concerns and data-driven design.

### 1.2. Core Architecture Principles
- **Modular Design:** Each module has a single, well-defined responsibility, promoting high cohesion and loose coupling. Dependencies are injected rather than hard-coded.
- **Performance Optimization:** The system prioritizes efficient DOM updates, proper memory management, and preloading of critical assets to ensure smooth gameplay.
- **Data-Driven Design:** All game content, from parts to objectives, is externalized into JSON files. This allows for easy modification and scaling without changing core game logic. [1]

### 1.3. Module Architecture
The architecture is a modular, event-driven system composed of three distinct layers:

#### 1.3.1. Core Logic Layer (`public/src/core/`)
-   **StateManager.js**: Abstraction layer over game state. Reactive state is backed by valtio in `store.js`; `StateManager` syncs with it, manages UI-facing vars (e.g., `current_money`, `current_heat`, `pause`), and notifies subscribers of changes.
-   **Game.js**: The central orchestrator. It provides a public API for high-level actions (`reboot_action`, `sell_action`) and delegates tasks to other core modules. It does not hold its own state.
-   **Engine.js**: Manages the main game loop (tick), delegating per-tick operations to specialized subsystems. It implements performance optimizations like part categorization and caching.
-   **heatSystem.js**: A dedicated subsystem to handle all heat transfer logic, abstracting this complexity away from the main `Engine`.
-   **PartSet.js / UpgradeSet.js**: Manages the collections of all available parts and upgrades, handling creation, retrieval, and global state updates (e.g., affordability checks).

#### 1.3.2. UI Layer (`public/src/components/`)
The UI uses a component-based architecture with specialized modules in `public/src/components/ui/`. Each module manages a discrete UI concern.

-   **ui.js**: Aggregator that initializes and holds references to all UI modules. It creates the `StateManager`, `InputHandler`, `ModalOrchestrator`, and instantiates specialized UI components (e.g., `InfoBarUI`, `PartsPanelUI`, `MeltdownUI`, `ObjectivesUI`).
-   **PageRouter.js**: Handles navigation between game screens (Reactor, Upgrades, Research, etc.), loading HTML from `pages/*.html` and coordinating page-specific initialization.
-   **pageSetupUI.js / pageInitUI.js**: Page lifecycle and setup logic; invoked by `PageRouter` when loading or unloading screens.
-   **Specialized UI Modules** (`ui/`): Each feature has its own module—`infoBarUI.js`, `partsPanelUI.js`, `meltdownUI.js`, `objectivesUI.js`, `heatVisualsUI.js`, `gridInteractionUI.js`, `upgradesUI.js`, `copyPasteUI.js`, and others—allowing focused changes without touching a central manager.

#### 1.3.3. Services Layer (`public/src/services/`)
-   **dataService.js**: A centralized service for fetching and caching all game content from JSON files.
-   **GoogleDriveSave.js**: Encapsulates all logic for interacting with the Google Drive API for cloud saves.

## 2. Data and Content Management

### 2.1. Overview
All game content is externalized into JSON files to create a data-driven architecture. The `dataService` is responsible for loading, caching, and validating this data at runtime.

### 2.2. Handling Large Numbers
The game uses **Break Infinity** (`break_infinity.js`) for arbitrary-precision arithmetic. Values from JSON are converted via `toDecimal()` in `utils/decimal.js`, which accepts numbers or strings and yields a `Decimal` instance for precise calculations.

-   **Runtime:** All monetary values, heat, power, and similar quantities use `Decimal` instances internally.
-   **Scope:** Applies to fields like `base_cost`, `reward`, `power_output`, `heat_output`, etc.

### 2.3. Data File Specifications

#### 2.3.1. `part_list.json`
An array of part templates defining the base type and rules for generating different levels.
-   **Required Fields:** `id`, `type`, `title`, `base_description`, `category`, `levels`, `base_cost` (number or string), `cost_multi`.
-   **Category-Specific Fields:**
    -   **Cells:** `power_output`, `heat_output`, `base_ticks`, and associated multipliers and upgrade costs.
    -   **Reflectors:** `base_power_increase`, `base_heat_increase`, `base_ticks`, and multipliers.
    -   **Cooling Parts:** `base_vent`, `base_transfer`, `base_containment`, and multipliers.
    -   **Capacity Parts:** `base_reactor_power`, `base_reactor_heat`, and multipliers.
    -   **Accelerators:** `ep_generation` and multipliers.
-   **Experimental Fields (Optional):** `experimental` (boolean), `experimental_level`, `experimental_erequires`, `experimental_cost` (number or string), and stat overrides.

#### 2.3.2. `upgrade_list.json`
An array of upgrade templates.
-   **Required Fields:** `id`, `type`, `title`, `description`, `icon` (full path from `/public`), `multiplier`.
-   **Cost Fields (One Required):** `cost` (number or string, for Money) or `ecost` (number or string, for EP).
-   **Optional Fields:** `actionId`, `prerequisite`, `erequires`, `levels`.

#### 2.3.3. `objective_list.json`
An array of objective definitions.
-   **Required Fields:** `title`, `checkId`.
-   **Reward Fields (At Least One Required):** `reward` (number, optional, money reward) or `ep_reward` (number, optional).
-   **Optional Fields:** `flavor_text`, `prerequisite`, `isChapterCompletion`.

#### 2.3.4. `flavor_text.json` & `help_text.json`
Objects containing UI text strings for tooltips, messages, and structured in-game help content.

## 3. Critical Game Mechanics

### 3.1. Heat Management System

#### 3.1.1. Overview
Heat is a core mechanic, existing in two forms: **Component Heat** (stored in a Part) and **Reactor Heat** (global). The heat system (`heatSystem.js`) simulates heat transfer between adjacent components.

#### 3.1.2. Heat Transfer
Heat transfer follows a deterministic algorithm:
1.  **Heat Segments**: Components connected via heat transfer paths form segments.
2.  **Conservation**: Within a segment, heat is moved, not created or destroyed.
3.  **Flow Direction**: Heat only flows from hotter to cooler components.
4.  **Limits**: Transfer is limited by the `transfer` capacity of components, and a component cannot absorb more heat than its remaining `containment`.

#### 3.1.3. Auto Heat Reduction
-   **Mechanism:** A unified heat reduction mechanism is controlled by the `reactor.heat_controlled` boolean property.
-   **Control:** This is enabled via the "Heat Control Operator" upgrade. When `true`, reactor heat is reduced each tick by the formula: `(reactor.max_heat / 10000) * vent_multiplier`.
-   **Independence:** This auto-reduction is independent of and unaffected by the presence of Heat Outlets.

#### 3.1.4. Heat-to-Power Scaling (Overpressure Fission)
The power bonus from the 'Overpressure Fission' upgrade is **critical for game balance** and uses **logarithmic scaling** to prevent exponential feedback loops at high heat.
-   **Correct Formula (Logarithmic):**
    ```javascript
    tile.power *= 1 + (this.heat_power_multiplier * (Math.log(this.current_heat) / Math.log(1000) / 100));
    ```
-   **Warning:** Any "simplification" to a linear formula will break game progression and must be avoided. This is enforced by the `tests/core/heat-power-scaling.test.js` test suite.

#### 3.1.5. Reactor Meltdown
A full reactor meltdown occurs if `current_heat` exceeds 200% of `max_heat`. This destroys all parts, stops the game engine, and restricts navigation.

### 3.2. Valve System
Valves are special components for advanced heat management, organized into three distinct groups.

#### 3.2.1. Group 1: Overflow Valves
-   **Purpose:** High-pressure relief to prevent component explosions.
-   **Activation:** Activates when an **input** component's heat exceeds **80%** of its containment.
-   **Transfer Direction:** Input → Output.

#### 3.2.2. Group 2: Top-up Valves
-   **Purpose:** Low-level maintenance to maintain minimum heat levels.
-   **Activation:** Activates when an **output** component's heat drops below **20%** of its containment.
-   **Transfer Direction:** Input → Output.

#### 3.2.3. Group 3: Check Valves
-   **Purpose:** Enforce one-way heat flow.
-   **Activation:** Always active.
-   **Transfer Direction:** Input → Output (unidirectional).

### 3.3. Part Mechanics
-   **Lifespan & Degradation:** Parts with finite lifespans (e.g., Cells, Reflectors) degrade over time. Their effectiveness (power, heat, bonuses) is proportional to their remaining ticks.
-   **Protium Cell Bonus:** The "Protium Cell" provides a persistent, stacking power bonus. When its lifespan ends, a global `protium_particles` counter is incremented, boosting the power of all current and future Protium Cells.
-   **Exotic Particle Generation:** Particle Accelerators generate Exotic Particles (EP), a prestige currency, based on the heat contained within the accelerator component.

### 3.4. Save/Load System
The game state is serializable to JSON for saving to Local Storage or Google Drive. The `heat_controlled` and other toggle states (e.g. auto_sell, auto_buy, time_flux, pause) are saved in the `toggles` object and restored in `applySaveState` via the StateManager setVar chain, which triggers `onToggleStateChange` and correctly applies values to the Reactor instance.

## 4. UI/UX Specification

### 4.1. UI Principles
-   **Clarity:** Game state (Money, Power, Heat) is always visible and easily understood.
-   **Responsive Design:** The UI adapts seamlessly from mobile (portrait) to desktop (landscape) layouts.
-   **Immediate Feedback:** Player actions provide immediate visual or auditory feedback.
-   **Data-Driven UI:** UI elements are dynamically generated from external JSON data files.

### 4.2. Layout and Flow
-   **Navigation:** A persistent top bar (desktop >900px) or bottom bar (mobile <=900px) allows navigation between **Reactor**, **Upgrades**, and **Research** screens.
-   **Panels:** A **Parts Panel** allows component selection. An **Info Bar** displays critical stats. An **Objectives Bar** shows the current objective.

### 4.3. Key Component Requirements
-   **Parts & Upgrades Panels:** Dynamically display all purchasable items from data files. Buttons must visually indicate their affordability state (e.g., grayscale). Unaffordable items remain clickable to show a tooltip.
-   **Reactor Grid:** Visually represents the `Tileset`, showing placed parts and their condition (lifespan, heat) via status bars.
-   **Visual Feedback:** The UI provides clear warnings for rising heat (glowing grid) and meltdowns (screen-wide effect). Objective completions trigger a visual flash.

## 5. Asset Management
A comprehensive asset management strategy is in place to optimize performance.

-   **High-Resolution Assets Exception:** PWA icons (e.g., `cell_1_1-192x192.png`, `cell_1_1-512x512.png`) are maintained as individual files for manifests, favicons, and app store listings.
-   **Best Practices:** Avoid hardcoding image paths in component code. Use descriptive names for CSS classes and monitor loading times after changes. Individual images are maintained as fallbacks for development.

## 6. Requirements

### 6.1. Functional Requirements (FR)
-   **FR-GRID:** The game features a 12x12 grid, expandable to 32x35, where players place, sell, and copy/paste parts.
-   **FR-PART:** Parts (Cells, Reflectors, Capacitors, Cooling, etc.) are defined by external data and have unique mechanics.
-   **FR-HEAT:** Heat exists in component and reactor forms, with a meltdown occurring at 200% max heat.
-   **FR-UPGRADE:** The system supports Standard (Money) and Experimental (EP) upgrades defined in data files.
-   **FR-OBJECTIVE:** A linear series of objectives with defined completion criteria and rewards.
-   **FR-SAVE:** Game state is serializable to JSON for Local Storage and optional Google Drive saving.

### 6.2. Non-Functional Requirements (NFR)
-   **NFR-PERF:** The game engine must operate with O(N) complexity relative to active parts and maintain 60 FPS.
-   **NFR-MAINT:** Enforce a clear separation of concerns between logic, UI, and services.
-   **NFR-TEST:** Core logic must be unit-testable without a live DOM, with a minimum of 80% test coverage.
-   **NFR-DATA:** All game content must be loaded from external, validated JSON files.
-   **NFR-SEC:** Sanitize user input, validate save data, and use secure OAuth 2.0 for Google Drive.
-   **NFR-ACC:** Support keyboard navigation and use appropriate ARIA labels.

## 7. Development Policies

### 7.1. Technical Debt and Deprecation
The project favors data migration over perpetual backward compatibility to reduce complexity.
-   **Guiding Principle:** The **Services Layer** is responsible for transforming any legacy data formats (e.g., old save files) into the current, canonical version *before* the data is passed to the Core Logic Layer. The Core layer must only ever deal with the current data format.
-   **Deprecation Process:** Legacy code must be isolated, documented with a sunset period, and completely removed after that period.
-   **Anti-Patterns to Remove:** Actively refactor fallback logic for data structures, backward compatibility shims in core logic, and duplicate implementations.

### 7.2. Logging
A centralized logger is attached to the game object (`game.logger`) to reduce console noise and improve user experience.
-   **Default Level:** The default logging level is `WARN` to minimize console output in production.
-   **Usage:** Components should use `this.game.logger?.debug()`, `info()`, `warn()`, and `error()` for logging.
-   **Console Controls:** Users can control the logging verbosity via functions available in the browser console (e.g., `setDebug()`, `setInfo()`).

### 7.3. Game Progression

Objectives are defined in `objective_list.json` and follow a four-chapter structure. The list below reflects the current implementation.

#### Chapter 1: First Fission
Place your first Cell; Sell all your power; Reduce Heat to 0; Put a Heat Vent next to a Cell; Purchase an Upgrade; Purchase a Dual Cell; Have at least 10 Cells; Purchase a Perpetual Cell upgrade; Purchase a Capacitor; Complete Chapter 1.

#### Chapter 2: Scaling Production
Generate at least 200 power per tick; Purchase Improved Chronometers; Have 5 different kinds of components; Have at least 10 Capacitors; Generate at least 500 power per tick; Upgrade Potent Uranium Cell to level 3 or higher; Auto-sell at least 500 power per tick; Sustain 1,000 power per tick for 30 ticks; Have at least 10 Advanced Capacitors and 10 Advanced Heat Vents; Complete Chapter 2.

#### Chapter 3: High-Energy Systems
Have at least 5 Quad Plutonium Cells; Achieve passive income of $50,000 per tick; Generate at least 10,000 power per tick; Have at least 5 Quad Thorium Cells; Reach $1,000,000,000; Have at least $10,000,000,000; Have at least 5 Quad Seaborgium Cells; Sustain reactor heat above 10,000,000 for 30 ticks without meltdown; Complete Chapter 3.

#### Chapter 4: The Experimental Frontier
Generate 10 Exotic Particles; Generate 51 EP; Generate 250 EP; Purchase Infused Cells and Unleashed Cells; Reboot in Research tab; Purchase an Experimental Upgrade; Have at least 5 Quad Dolorium Cells; Generate 1,000 EP; Have at least 5 Quad Nefastium Cells; Place an experimental part; Complete Chapter 4.