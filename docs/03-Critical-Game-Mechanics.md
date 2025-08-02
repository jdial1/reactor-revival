# Reactor Revival: Critical Game Mechanics Specification
This document details critical game mechanics that must be implemented with precision to ensure balanced and predictable gameplay.
## 1. Heat-to-Power Scaling (Overpressure Fission Upgrade)
- **Requirement ID**: CGM-001
- **Description**: The power bonus from the 'Overpressure Fission' upgrade shall use logarithmic scaling to prevent exponential feedback loops at high heat. Linear scaling is explicitly forbidden.
- **Reference**: See **[HEAT_POWER_SCALING_CRITICAL.md](./HEAT_POWER_SCALING_CRITICAL.md)** for the complete specification.
- **Verification**: A dedicated test suite (`heat-power-scaling.test.js`) validates and enforces the correct logarithmic formula.
## 2. Heat Transfer Mechanics
- **Requirement ID**: CGM-002
- **Description**: Heat transfer between adjacent components follows a deterministic algorithm ensuring heat flows from high to low temperature components, respecting containment limits.
- **Specification**:
1.  **Heat Segments**: Components connected via heat transfer paths form segments.
2.  **Conservation**: Within a segment, heat is moved, not created or destroyed, during transfer.
3.  **Flow Direction**: Heat only flows from hotter to cooler components.
4.  **Transfer Limits**: Heat transfer is limited by the `transfer` capacity of the components.
5.  **Equilibrium**: The algorithm naturally seeks thermal equilibrium across a segment over time.
6.  **Containment Limits**: A component cannot absorb more heat than its remaining `containment` allows.
## 3. Part Lifespan and Degradation
- **Requirement ID**: CGM-003
- **Description**: Parts with finite lifespans (Cells, Reflectors) degrade over time and lose effectiveness as they approach expiration.
- **Specification**:
1.  **Tick Counting**: Each part with a lifespan tracks its remaining ticks.
2.      **Degradation Formula**: A part's effectiveness is a ratio of its remaining ticks to its total ticks. This directly affects its output (power, heat, bonuses).
```javascript
effectiveness = tile.ticks / part.base_ticks;
final_power_output = part.power * effectiveness;

    Expiration: Parts are removed from the grid when their ticks reach zero.
    Visual Feedback: The UI shall indicate a part's condition and remaining lifespan.

4. Protium Cell Permanent Bonus

    Requirement ID: CGM-004
    Description: The "Protium Cell" is an experimental part that provides a persistent, stacking power bonus for all future Protium Cells upon its depletion.
    Specification:

    Trigger: This effect occurs when a Protium Cell's lifespan (ticks) reaches zero.
    Bonus Application: Upon depletion, a global counter (protium_particles) is incremented by the cell's count (1 for Single, 2 for Dual, 4 for Quad).
    Persistent Effect: The power output of all currently placed and future Protium Cells is multiplied by (1 + (protium_particles * 0.1)).
    Data Persistence: The protium_particles value must be saved with the game state and persists through reboots.

    Verification: Tests must confirm that the bonus is applied correctly, stacks additively, and persists across game sessions and reboots.

5. Reactor Meltdown Conditions

    Requirement ID: CGM-005
    Description: A full reactor meltdown occurs when global heat exceeds 200% of maximum heat capacity.
    Specification:

    Threshold: current_heat > (max_heat * 2.0)
    Effects: All parts are destroyed, the game engine is stopped, and navigation is restricted.
    Warning System: The UI shall provide clear visual warnings as heat approaches critical levels.

6. Exotic Particle Generation

    Requirement ID: CGM-006
    Description: Particle Accelerators generate Exotic Particles (EP) based on the amount of heat transferred through them.
    Specification:

    Generation Formula: ep_generated = heat_transferred * ep_generation_rate
    Accumulation: EP is a prestige currency that persists through reboots.

7. Upgrade Purchase and Application

    Requirement ID: CGM-007
    Description: Upgrades apply their effects immediately upon purchase.
    Specification:

    Cost Calculation: cost = base_cost * (multiplier ^ current_level)
    Action Execution: An actionId links the upgrade to a specific function in upgradeActions.js that modifies game state or parameters.

8. Save/Load System Integrity

    Requirement ID: CGM-008
    Description: The save/load system must maintain complete game state integrity.
    Specification:

    Serialization: The entire game state, including all core modules (Game, Reactor, PartSet, UpgradeSet, Tileset, ObjectiveManager), must be serializable to JSON.
    Validation: Save data must be validated upon loading to handle corruption or version mismatches gracefully.

9. Large Number Precision

    Requirement ID: CGM-009
    Description: All calculations involving large numbers (e.g., money, exotic particles, high-level costs) must be performed using BigInt to prevent floating-point precision errors.
    Specification:

    Data Storage: All cost and currency values in data files (part_list.json, upgrade_list.json) that can exceed Number.MAX_SAFE_INTEGER must be stored as strings.
    Runtime Conversion: The game's data loading layer must convert these string-based numbers into BigInt upon initialization.
    Arithmetic: All subsequent arithmetic operations (addition, subtraction, multiplication) on these values must use BigInt operators (e.g., 100n + 50n).

    Verification: Tests must confirm that calculations with numbers greater than 9x10¹⁵ remain precise and do not suffer from floating-point inaccuracies.
