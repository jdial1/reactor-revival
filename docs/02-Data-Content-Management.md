# Reactor Revival: Data and Content Management Specification
## 1. Overview
All game content is externalized into JSON files to create a data-driven architecture. The `dataService` is responsible for loading, caching, and validating this data at runtime. This document defines the schemas for these files.

### 2.4 Migration Guidelines
When adding new parts or UI elements:

4. Avoid direct references to individual image files in `/public/img/parts/`
### 2.5 Upgrade Icon Requirements
Upgrade icons in `upgrade_list.json` must follow these requirements:
- **Full Paths:** All icon values must be complete paths relative to the `/public` directory (e.g., "img/upgrades/upgrade_flux.png")

## 3. Handling Large Numbers (Important!)
To prevent precision loss with very large numbers (e.g., late-game costs and stats), any numerical value that is expected to exceed `Number.MAX_SAFE_INTEGER` (approximately 9x10¹⁵) **must be stored as a string** in the JSON files.
- **Standard:** Store large numbers as strings (e.g., `"35000000000000000"`).
- **Implementation:** The `dataService` automatically parses these string-based numbers into `BigInt` upon loading for precise calculations.
- **Scope:** This applies to any field that can exceed Number.MAX_SAFE_INTEGER (9x10¹⁵). This includes, but is not limited to, base_cost, cost, ecost, experimental_cost, and reward_money, as well as high-level part stats like power_output, heat_output, base_containment, and base_transfer.
Small numbers (e.g., `levels`, `power_multi` for early-game parts) should remain as standard JSON numbers.
### 3.1 Number Formatting
All numerical values stored as strings for BigInt parsing must not use scientific notation (e.g., "1e30"). They must be written out as a full numeric string (e.g., "1000000000000000000000000000000").
## 4. Data File Specifications
### 4.1 part_list.json: Part Templates
An array of part templates. Each object defines a base type of part (e.g., "Uranium Cell") and the rules for generating its different levels.
#### Required Fields
- **id** (string): Unique identifier for the part's base type (e.g., "uranium").
- **type** (string): The base type name, used for generating multi-level parts (e.g., "uranium").
- **title** (string): Display name (e.g., "Uranium Cell").
- **base_description** (string): Description template for the part.
- **category** (string): Functional group (e.g., "cell", "vent", "reflector").
- **levels** (number): Number of tiers for this part.
- **base_cost** (string): Cost of the level 1 part, stored as a string to support `BigInt`.
- **cost_multi** (number): Multiplier for subsequent levels' costs.
#### Category-Specific Fields
##### Cell Parts
- **power_output** (string|number): Base power generation per tick. Use string format for values exceeding `Number.MAX_SAFE_INTEGER` (e.g., late-game cells).
- **heat_output** (string|number): Base heat generation per tick. Use string format for values exceeding `Number.MAX_SAFE_INTEGER` (e.g., late-game cells).
- **base_ticks** (number): Base lifespan in ticks.
- **power_multi** (number): Power multiplier per level.
- **heat_multi** (number): Heat multiplier per level.
- **ticks_multi** (number): Lifespan multiplier per level.
- **cell_tick_upgrade_cost**, **cell_power_upgrade_cost**, **cell_perpetual_upgrade_cost** (string): Base costs for associated cell-specific upgrades, stored as strings to support `BigInt`.
- **cell_tick_upgrade_multi**, **cell_power_upgrade_multi** (number): Cost multipliers for associated upgrades.
##### Reflector Parts
- **power_boost** (number): Power boost percentage for adjacent cells.
- **heat_boost** (number): Heat boost percentage for adjacent cells.
- **base_ticks** (number): Base lifespan in ticks.
- **power_boost_multi**, **heat_boost_multi**, **ticks_multi** (number): Stat multipliers per level.
##### Cooling Parts (Vents, Exchangers, Inlets, Outlets, Coolants)
- **base_vent** (number): Base vent value for heat management.
- **base_transfer** (string|number): Base transfer value for heat management. Use string format for values exceeding `Number.MAX_SAFE_INTEGER`.
- **base_containment** (string|number): Base containment value for heat management. Use string format for values exceeding `Number.MAX_SAFE_INTEGER`.
- **vent_multi** (number): Vent multiplier per level.
- **transfer_multi** (number): Transfer multiplier per level.
- **containment_multi** (number): Containment multiplier per level.
##### Capacity Parts (Capacitors, Platings)
- **base_reactor_power**, **base_reactor_heat** (number): Amount to add to reactor's maximum capacity.
- **reactor_power_multi**, **reactor_heat_multi** (number): Stat multipliers per level.
##### Accelerator Parts
- **ep_generation** (number): Base prestige currency generation rate.
- **ep_generation_multi** (number): Generation multiplier per level.
- **ep_heat_multi** (number): Heat limit multiplier per level.
#### Optional: Experimental Part Fields
- **experimental** (boolean): If true, this part is an experimental component. Defaults to false.
- **experimental_level** (number): Specifies which level of a part line is the experimental version.
- **experimental_erequires** (string): The ID of an experimental upgrade required to unlock this part level.
- **experimental_cost** (string): The cost in prestige currency for the experimental level, stored as a string to support `BigInt`.
- **experimental_title** (string): A unique display name for the experimental level.
- **experimental_description** (string): A unique description for the experimental level.
- **experimental_base_...** (number|string): Overrides for `base_` stats specific to the experimental level (e.g., `experimental_base_containment`).
- **experimental_...** (number): Overrides for non-`base_` stats like boosts (e.g., `experimental_heat_boost`).
---
### 4.2 upgrade_list.json: Upgrade Templates
An array of upgrade templates.
#### Required Fields
- **id** (string): Unique identifier.
- **type** (string): Upgrade category used for UI grouping. Valid values include standard types like "other", "vents", "exchangers", or any string prefixed with `experimental_` for Research upgrades (e.g., "experimental_laboratory", "experimental_boost", "experimental_parts").
- **title** (string): Display name.
- **description** (string): In-game description.
- **icon** (string): A full relative path to the upgrade icon from the `/public` directory (e.g., "img/upgrades/upgrade_flux.png", "img/parts/cells/cell_5_2.png").
- **multiplier** (number): Cost multiplier per level.
- **levels** (number, optional): Maximum purchasable level (defaults to game-wide max if omitted).
#### Cost Fields (One Required)
- **cost** (string, optional): Base cost in Money (Standard Upgrades), stored as a string to support `BigInt`.
- **ecost** (string, optional): Base cost in prestige currency (Experimental Upgrades), stored as a string to support `BigInt`.
#### Optional Fields
- **actionId** (string): Identifier for the function to execute upon purchase.
- **prerequisite** (string): ID of another upgrade that must be purchased first.
- **erequires** (string): ID of an experimental upgrade that must be purchased first.
---
### 3.3 objective_list.json: Objective Definitions
An array of objective definitions.
#### Required Fields
- **id** (string): Unique identifier.
- **title** (string): Display text for the objective.
- **checkId** (string): Identifier for the completion-check function.
#### Reward Fields (At Least One Required)
- **reward_money** (string, optional): Money reward, stored as a string to support `BigInt`.
- **reward_ep** (number, optional): Prestige currency reward.
#### Optional Fields
- **description** (string): Detailed description of the objective.
- **prerequisite** (string): ID of an objective that must be completed first.
---
### 4.4 flavor_text.json: UI Text Content
An object containing various text strings used throughout the UI.
```json
{
"tooltips": {
"part_placement": "Click to place part",
...
},
"messages": {
"meltdown": "Reactor meltdown! All parts destroyed.",
...
}
}

4.5 help_text.json: In-Game Help Content

An object containing structured help content for different game topics, used in the "About" screen or other help sections.

{
"basic_overview": {
"title": "Basic Overview",
"content": "Cells = power and heat<br>Power = money..."
},
"parts": {
"cells": "Cells are your primary power generators...",
...
},
"controls": {
"autoSell": "Automatically sells a portion of your power.",
...
}
}
