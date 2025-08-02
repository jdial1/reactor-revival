# Reactor Revival: System and Architecture Specification
## 1. Overview
Reactor Revival is a modern, browser-based incremental game built with vanilla JavaScript, HTML5, and CSS3. The architecture emphasizes modularity, performance, and maintainability through clear separation of concerns and data-driven design.
## 2. Core Architecture Principles
### 2.1 Modular Design
- **Separation of Concerns:** Each module has a single, well-defined responsibility
- **Loose Coupling:** Modules communicate through well-defined interfaces
- **High Cohesion:** Related functionality is grouped together
- **Dependency Injection:** Dependencies are injected rather than hard-coded
### 2.2 Performance Optimization

- **Efficient DOM Updates:** Batch DOM operations and use efficient selectors
- **Memory Management:** Proper cleanup of event listeners and references
- **Asset Preloading:** Critical assets are preloaded for smooth gameplay
### 2.3 Asset Management Strategy
The game implements a comprehensive asset management strategy to optimize performance:

#### 2.3.2 High Resolution Assets Exception
- **PWA Icons:** High resolution cell 1 images (`cell_1_1-192x192.png`, `cell_1_1-512x512.png`) remain as individual files
- **Purpose:** These are used for PWA manifests, favicons, and app store icons
- **Implementation:** Direct file paths are maintained for these specific use cases
#### 2.3.3 Asset Loading Pipeline
3. **Cache Management:** Browser caching is leveraged for optimal performance
4. **Fallback Handling:** Individual images serve as fallbacks during development
## 3. Module Architecture
The target architecture is a modular, event-driven system designed for performance, testability, and maintainability.
### 3.1. Core Logic Layer (`src/core/`)
-   **StateManager.js**: The single source of truth for all game state (e.g., `current_money`, `current_heat`, `current_ep`, `total_ep`, `protium_particles`, `pause`, `auto_sell`). Uses an observer pattern to notify subscribers (primarily UI components) of changes. It is the only module authorized to directly mutate state.
-   **Game.js**: The central orchestrator. Provides a public API for high-level actions (`reboot_action`, `sell_action`), which it delegates to the `StateManager` or other core modules. It does **not** hold its own state, accessing it via getters from the `StateManager`.
-   **Engine.js**: Manages the main game loop (tick). It delegates per-tick operations to specialized subsystems like the `HeatManager`. Implements performance optimizations such as part categorization and caching.
-   **HeatManager.js**: A dedicated subsystem to handle all heat transfer logic, abstracting this complexity away from the main `Engine`.
-   **PartSet.js / UpgradeSet.js**: Manages the collections of all available parts and upgrades, loaded from data files. Handles creation, retrieval, and global updates (e.g., affordability checks).
### 3.2. UI Layer (`src/components/`)
-   **UI.js**: The primary UI manager. It subscribes to the `StateManager` and orchestrates DOM updates in response to state changes. It caches DOM element references and handles event delegation.
-   **PageRouter.js**: Handles navigation between game screens (Reactor, Upgrades, Research), loading and unloading page-specific components.
-   **Page Components (`*Page.js`)**: Encapsulated components for each major UI view, responsible for their own structure and event listeners. They are built from HTML templates and rendered into the main layout.
### 3.3. Services Layer (`src/services/`)
-   **dataService.js**: A centralized service for fetching and caching all game content from JSON files.
-   **GoogleDriveSave.js**: Encapsulates all logic for interacting with the Google Drive API for cloud saves.
## 4. Functional Requirements (FR)
### FR-GRID: Reactor Grid System
- **FR-GRID-1**: The game shall feature a grid of Tiles where players can place Parts.
- **FR-GRID-2**: The initial grid size shall be 12x12.
- **FR-GRID-3**: The grid dimensions shall be expandable up to 32x35 via in-game Upgrades.
- **FR-GRID-4**: Players can place one Part per Tile via a left-click or tap.
- **FR-GRID-5**: Players can sell/remove a Part via a right-click or long-press. The refund is based on remaining durability and heat.
- **FR-GRID-6**: The system must support copying/pasting the grid layout via a string.
### FR-PART: Component Mechanics
- **FR-PART-1**: All Parts shall be defined by external data files (see `02-Data-Content-Management.md`).
- **FR-PART-2**: Parts are categorized (e.g., cell, reflector, vent).
- **FR-PART-3**: **Cells**: Generate Power and Heat. They have a finite lifespan measured in ticks.
- **FR-PART-4**: **Reflectors**: Boost adjacent Cells' Power (and sometimes Heat). They have a finite lifespan.
- **FR-PART-5**: **Capacitors & Platings**: Increase the reactor's maximum Power and Heat capacity, respectively.
- **FR-PART-6**: **Cooling Components**: Vents, Exchangers, Inlets, Outlets, and Coolants manage heat via vent, transfer, and containment attributes.
- **FR-PART-7**: **Particle Accelerators**: Generate a prestige currency based on the amount of heat transferred through them.
### FR-HEAT: Heat Management System
- **FR-HEAT-1**: Heat is modeled in two forms:
- **Component Heat**: Stored within an individual Part. Exceeding its containment causes an explosion.
- **Reactor Heat**: Global heat stored within the reactor.
- **FR-HEAT-2**: A Meltdown occurs if `current_heat` exceeds 200% of `max_heat`, destroying all parts and stopping the engine.
- **FR-HEAT-3**: A dedicated `HeatManager` simulates heat transfer between adjacent components.
### FR-UPGRADE: Upgrade System
- **FR-UPGRADE-1**: All Upgrades are defined by external data files.
- **FR-UPGRADE-2**: The system supports two upgrade types:
- **Standard Upgrades**: Purchased with Money, reset on Reboot.
- **Experimental Upgrades**: Purchased with a prestige currency, persist through Reboots.
- **FR-UPGRADE-3**: Purchasing an upgrade applies its effect immediately via a defined `actionId`.
### FR-OBJECTIVE: Objective System
- **FR-OBJECTIVE-1**: The game presents a linear series of Objectives defined in an external data file.
- **FR-OBJECTIVE-2**: The system continuously checks if the current objective's completion criteria (`checkId`) are met.
- **FR-OBJECTIVE-3**: Upon completion, the player receives a reward and the next objective.
### FR-SAVE: Save and Load System
- **FR-SAVE-1**: The entire game state must be serializable to JSON.
- **FR-SAVE-2**: The system shall support saving to/loading from the browser's Local Storage.
- **FR-SAVE-3**: The system shall optionally support saving to/loading from the user's Google Drive account.
## 6. Non-Functional Requirements (NFR)
### NFR-PERF: Performance
- **NFR-PERF-1**: The core game engine loop (tick) must operate with linear time complexity (O(N)) relative to the number of active Parts.
- **NFR-PERF-2**: The system shall maintain 60 FPS during normal gameplay.
- **NFR-PERF-3**: UI updates shall be optimized to prevent excessive DOM manipulation.
### NFR-MAINT: Maintainability
- **NFR-MAINT-1**: The architecture shall enforce a clear separation between game logic, UI, and services as defined in Section 3.
- **NFR-MAINT-2**: All public APIs shall be documented with JSDoc comments.
### NFR-TEST: Testability
- **NFR-TEST-1**: All core logic must be implemented for isolated unit testing without a live DOM.
- **NFR-TEST-2**: Maintain a minimum test coverage of 80% for all core game logic.
### NFR-DATA: Data Management
- **NFR-DATA-1**: All game content shall be defined in external JSON files and loaded at runtime.
- **NFR-DATA-2**: Data files shall be validated against schemas to ensure integrity.
### NFR-SEC: Security
- **NFR-SEC-1**: User input shall be sanitized to prevent XSS.
- **NFR-SEC-2**: Save data shall be validated before loading to prevent state corruption.
- **NFR-SEC-3**: Google Drive integration shall use secure OAuth 2.0.
### NFR-ACC: Accessibility
- **NFR-ACC-1**: The game shall support keyboard navigation.
- **NFR-ACC-2**: UI elements shall have appropriate ARIA labels and roles.
## 7. Technical Debt and Deprecation Policy
To ensure long-term maintainability and reduce complexity, the project will adhere to a strict policy regarding legacy code, backward compatibility shims, and fallback logic. The primary goal is to favor data migration over perpetual backward compatibility.
### 7.1. Guiding Principles
- **Avoid Fallback Logic:** Code should not contain long-term branching logic to handle multiple data formats or legacy states. The **Services Layer** should transform old data formats into the current, canonical version *before* the data is passed to the Core Logic Layer. The Core layer must only ever deal with the current data format.
- **Migrate Forward:** When a data format changes (e.g., save files, data files), a one-time, transparent migration process should be implemented to update the user's data to the latest format.
- **Sunset Legacy Code:** All compatibility code must have a defined "sunset" period (e.g., two major versions or 6 months), after which it will be removed.
### 7.2. Deprecation Process
When a feature or data format must be changed, the following process shall be followed:
1. **Identify & Isolate:** Isolate the legacy code in a clearly named function (e.g., `loadLegacySaveFormat`).
2. **Document:** Add explicit comments (`
3. **Implement Migration Path:** Create a function that detects the old format and transparently migrates it to the new format upon loading. The game should **only ever save in the new format**.
4. **Define Sunset Period:** Establish a reasonable period during which the migration logic will remain active.
5. **Remove:** After the sunset period has passed, completely remove the legacy code, migration logic, and associated documentation.
### 7.3. Anti-Patterns to Actively Remove
The following patterns are considered technical debt and should be refactored or removed whenever encountered.
#### 1. Fallback Logic for Data Structures
- **Description**: Code that checks for the existence of multiple versions of a data structure (e.g., `if (saveData.old_field) { ... } else {  }`).
- **Problem**: This bloats the core logic with historical knowledge, increases branching complexity, and makes the current data schema ambiguous.
- **Solution**: Data migration should be handled at the **Services Layer** upon loading. The `dataService` or `GoogleDriveSave` should transform old save formats into the current, canonical version *before* the data is passed to the Core Logic Layer. The Core layer must only ever deal with the current data format.
#### 2. Backwards Compatibility in Core Game Logic
- **Description**: The `Engine`, `Reactor`, or `Part` classes containing conditional logic to handle behaviors from older game versions.
- **Problem**: This violates the principle of a pure, rule-based core. The game simulation should not be burdened with historical context.
- **Solution**: Game mechanics should be deterministic based on the current state and data. If a mechanic changes, the change should be absolute. Save data migration (see above) is the correct mechanism to update old states to be compatible with new rules.
#### 3. "Temporary" Hacks or Workarounds
- **Description**: Quick fixes that violate established architecture for the sake of speed.
- **Problem**: "Temporary" solutions often become permanent, leading to technical debt and unpredictable side effects.
- **Solution**: All code must follow the defined architecture. If a deviation is absolutely necessary, it must be accompanied by a technical debt ticket (e.g., a GitHub Issue) that is scheduled for a near-future sprint to be properly refactored.
#### 4. Duplicate Implementations
- **Description**: An "old way" and a "new way" of doing something co-existing in the code. A clear example is having the same utility CSS class (`.unaffordable`) defined in multiple files.
- **Problem**: Creates confusion, visual inconsistency, and increases maintenance overhead. For example, multiple conflicting definitions for the `.unaffordable` class resulted in different "grayed-out" styles for parts and upgrades.
- **Solution**: When a new implementation is introduced, a plan must be made to migrate all uses of the old implementation and then delete it entirely, as outlined in the Deprecation Strategy.
This pattern has been refactored by consolidating all `.unaffordable` styles into a single, canonical definition in `base.css`.
### 7.4. Deprecation Example: Google Drive Save Decryption
- **Legacy Code:** `src/services/GoogleDriveSave.js` contains a `decompressAndDecryptLegacy` method to handle an old `pako`-based save structure.
- **Current Logic:** The primary `decompressAndDecrypt` method uses a `try...catch` block. If the modern `@zip.js` decryption fails, it falls back to the legacy method.
- **Policy Action:** This fallback is a temporary measure. A formal migration path should be implemented as described in **[SAVE_LOAD_INTEGRITY_IMPLEMENTATION.md](./SAVE_LOAD_INTEGRITY_IMPLEMENTATION.md)**, with a planned removal date for the legacy code.
