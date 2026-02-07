# Reactor Revival: Complete Game Documentation

Welcome to the Reactor Revival documentation. This document provides comprehensive information about the game's architecture, data management, game mechanics, and UI/UX specifications.

## 1. System and Architecture

### 1.1. Overview
Reactor Revival is a modern, browser-based incremental game built with vanilla JavaScript, HTML5, and CSS3. The architecture emphasizes modularity, performance, and maintainability through clear separation of concerns and data-driven design.

### 1.2. Core Architecture Principles
- **Modular Design:** Each module has a single, well-defined responsibility, promoting high cohesion and loose coupling. Dependencies are injected rather than hard-coded.
- **Performance Optimization:** The system prioritizes efficient DOM updates, proper memory management, and preloading of critical assets to ensure smooth gameplay.
- **Data-Driven Design:** All game content, from parts to objectives, is externalized into JSON files. This allows for easy modification and scaling without changing core game logic. [1]

### 1.3. Module Architecture
The architecture is a modular, event-driven system composed of three distinct layers:

#### 1.3.1. Core Logic Layer (`public/src/core/`)
-   **StateManager.js**: The single source of truth for all game state (e.g., `current_money`, `current_heat`, `protium_particles`, `pause`). It uses an observer pattern to notify subscribers of changes and is the only module authorized to directly mutate state.
-   **Game.js**: The central orchestrator. It provides a public API for high-level actions (`reboot_action`, `sell_action`) and delegates tasks to other core modules. It does not hold its own state.
-   **Engine.js**: Manages the main game loop (tick), delegating per-tick operations to specialized subsystems. It implements performance optimizations like part categorization and caching.
-   **HeatManager.js**: A dedicated subsystem to handle all heat transfer logic, abstracting this complexity away from the main `Engine`.
-   **PartSet.js / UpgradeSet.js**: Manages the collections of all available parts and upgrades, handling creation, retrieval, and global state updates (e.g., affordability checks).

#### 1.3.2. UI Layer (`public/src/components/`)
-   **UI.js**: The primary UI manager. It subscribes to the `StateManager` and orchestrates DOM updates in response to state changes.
-   **PageRouter.js**: Handles navigation between game screens (Reactor, Upgrades, Research), loading and unloading page-specific components.
-   **Page Components (`*Page.js`)**: Encapsulated components for each major UI view, built from HTML templates.

#### 1.3.3. Services Layer (`public/src/services/`)
-   **dataService.js**: A centralized service for fetching and caching all game content from JSON files.
-   **GoogleDriveSave.js**: Encapsulates all logic for interacting with the Google Drive API for cloud saves.

## 2. Data and Content Management

### 2.1. Overview
All game content is externalized into JSON files to create a data-driven architecture. The `dataService` is responsible for loading, caching, and validating this data at runtime.

### 2.2. Handling Large Numbers
To prevent precision loss with numbers exceeding `Number.MAX_SAFE_INTEGER` (~9e15), any such value **must be stored as a string** in the JSON files. The `dataService` automatically parses these into `BigInt` for precise calculations.

-   **Standard:** Store large numbers as full numeric strings (e.g., `"1000000000000000000"`), not in scientific notation.
-   **Scope:** Applies to fields like `base_cost`, `reward_money`, `power_output`, `heat_output`, etc.

### 2.3. Data File Specifications

#### 2.3.1. `part_list.json`
An array of part templates defining the base type and rules for generating different levels.
-   **Required Fields:** `id`, `type`, `title`, `base_description`, `category`, `levels`, `base_cost` (string), `cost_multi`.
-   **Category-Specific Fields:**
    -   **Cells:** `power_output`, `heat_output`, `base_ticks`, and associated multipliers and upgrade costs.
    -   **Reflectors:** `power_boost`, `heat_boost`, `base_ticks`, and multipliers.
    -   **Cooling Parts:** `base_vent`, `base_transfer` (string), `base_containment` (string), and multipliers.
    -   **Capacity Parts:** `base_reactor_power`, `base_reactor_heat`, and multipliers.
    -   **Accelerators:** `ep_generation` and multipliers.
-   **Experimental Fields (Optional):** `experimental` (boolean), `experimental_level`, `experimental_erequires`, `experimental_cost` (string), and stat overrides.

#### 2.3.2. `upgrade_list.json`
An array of upgrade templates.
-   **Required Fields:** `id`, `type`, `title`, `description`, `icon` (full path from `/public`), `multiplier`.
-   **Cost Fields (One Required):** `cost` (string, for Money) or `ecost` (string, for EP).
-   **Optional Fields:** `actionId`, `prerequisite`, `erequires`, `levels`.

#### 2.3.3. `objective_list.json`
An array of objective definitions.
-   **Required Fields:** `id`, `title`, `checkId`.
-   **Reward Fields (At Least One Required):** `reward_money` (string, optional) or `reward_ep` (number, optional).
-   **Optional Fields:** `description`, `prerequisite`.

#### 2.3.4. `flavor_text.json` & `help_text.json`
Objects containing UI text strings for tooltips, messages, and structured in-game help content.

## 3. Critical Game Mechanics

### 3.1. Heat Management System

#### 3.1.1. Overview
Heat is a core mechanic, existing in two forms: **Component Heat** (stored in a Part) and **Reactor Heat** (global). A dedicated `HeatManager` simulates heat transfer between adjacent components.

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
-   **Exotic Particle Generation:** Particle Accelerators generate Exotic Particles (EP), a prestige currency, based on the amount of heat transferred through them.

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

Chapter 1: First Fission: Mastering the Basics

This chapter introduces the fundamental concepts of power generation, heat management, and component interaction. It ensures the player understands the core loop of placing parts, earning money, and managing the immediate consequences.

Existing Objectives:

    First Cell: Place your first Cell in the reactor.

    Sell Power: Sell all your power by clicking 'Power'.

    Reduce Heat: Reduce your Current Heat to 0 by clicking 'Heat'.

    Component Synergy: Put a Heat Vent next to a Cell.

    First Upgrade: Purchase any upgrade from the Upgrades screen.

    Store Power: Increase your Max Power using a Capacitor.

    Component Diversity: Use at least 5 different kinds of components in your reactor.

New Padded Objectives:
8. Boosted Power: Place a Reflector next to a Cell to boost its power output.
9. First Payday: Accumulate a total of $1,000.
10. Heat Transfer: Place a Heat Exchanger between a hot component and a cooler one.
Chapter 2: Scaling Production: Automation and Efficiency

This chapter focuses on moving beyond basic setups to more complex and sustainable designs. It introduces automation, tiered components, and the necessity of scaling up both power generation and support systems.

Existing Objectives:

    Tier 2 Power: Purchase a Dual Uranium Cell.

    Cell Expansion: Have at least 10 active Cells in your reactor.

    Power Milestone I: Generate 200 Power per tick.

    Faster Ticks: Purchase the 'Improved Chronometers' upgrade.

    Capacitor Bank: Have at least 10 Capacitors in your reactor.

    Perpetual Motion: Research Perpetual Uranium Cells to automate cell replacement.

    Automated Income: Auto-sell 500 Power per tick.

    Power Milestone II: Generate 500 Power per tick.

    Potent Fuel: Research 'Potent Uranium III' to enhance Uranium Cells.

    Initial Expansion: Expand the reactor grid twice.

Chapter 3: High-Energy Systems: Advanced Power and Expansion

This chapter challenges the player to manage larger, more powerful reactors. It introduces higher-tier fuel sources, significant income goals, and the challenge of managing massive amounts of heat.

Existing Objectives:

    Sustained Output: Sustain 1,000 Power per tick for 3 minutes without interruption.

    Infrastructure Upgrade: Have at least 10 Capacitors II and 10 Vents II.

    Plutonium Power: Have at least 5 active Quad Plutonium Cells in your reactor.

    Economic Milestone I: Reach an income of 50k per tick.

    Major Expansion: Expand the reactor grid four times.

    Thorium Power: Have at least 5 active Quad Thorium Cells in your reactor.

    First Billion: Earn your first billion dollars.

    Seaborgium Power: Have at least 5 active Quad Seaborgium Cells in your reactor.

    Economic Milestone II: Earn a total of 10 billion dollars.

    Master of Heat: Sustain 10 Million Reactor Heat for 5 minutes without a meltdown.

Chapter 4: The Experimental Frontier: Exotic Particles and Prestige

This final chapter introduces the prestige mechanic of Exotic Particles (EP). Objectives focus on generating EP, purchasing powerful experimental upgrades, and utilizing endgame-tier components that redefine the limits of the reactor.

Existing Objectives:

    First Particle: Generate 10 Exotic Particles (EP).

    First Research: Purchase the 'Infused Cells' and 'Unleashed Cells' experimental upgrades.

    Reboot: Perform a Reboot for EP to reset your progress and gain prestige.

    Particle Milestone I: Generate 51 EP in a single run.

    Experimental Tech: Purchase any Experimental Upgrade.

    Particle Milestone II: Generate 250 EP in a single run.

    Place Experimental Part: Place an Experimental Part, like a Protium Cell, in your reactor.

    Dolorium Power: Have at least 5 active Quad Dolorium Cells in your reactor.

    Particle Milestone III: Generate 1,000 EP in a single run.

    Nefastium Power: Have at least 5 active Quad Nefastium Cells in your reactor.