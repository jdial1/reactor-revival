# Velocity's Journal - Critical Performance Learnings

## 2024-07-26 - Memory Churn in `_processTick` from Array Methods

**Learning:** The core game loop in `public/src/core/engine.js` (`_processTick`) was using `Array.prototype.filter()` on every frame for heat transfer logic. This created new, temporary arrays multiple times per tick, leading to unnecessary memory allocations and putting pressure on the garbage collector, which can cause frame rate stutter.

**Action:** Replaced all instances of `.filter()` in the hot path with `for` loops to iterate and populate new arrays, and used `indexOf`/`splice` for in-place removal. This avoids creating new arrays in the loop, resulting in a more stable memory profile and smoother frame rate.

## 2024-07-27 - Eliminating Memory Churn and I/O in `_processTick`

**Learning:** The core game loop was still performing several anti-patterns:
1.  **Redundant Filtering:** Iterating over `active_vessels` or `active_exchangers` every tick to find specific components (valves, vents, capacitors).
2.  **Temporary Allocations:** Creating new arrays (`[]`) and sets (`new Set()`) inside the tick for local processing (explosions, heat exchange neighbors).
3.  **Logging Overhead:** `console.log` and expensive string interpolation in `game.logger` calls were active in the hot path.
4.  **Timer Backlog:** Using `setTimeout` for high-frequency visual feedback (vent blinking) caused unnecessary task scheduling.

**Action:**
1.  **Specific Active Lists:** Updated `_updatePartCaches` to populate dedicated arrays (`active_valves`, `active_vents`, `active_capacitors`) once per layout change.
2.  **Object Pooling:** Pre-allocated reusable arrays and sets in the `Engine` constructor for use during the tick, clearing them instead of re-instantiating.
3.  **Removed Logging:** Stripped all `console.log` calls and wrapped frequent `game.logger` calls in existence guards.
4.  **Optimized Visuals:** Replaced staggered `setTimeout` calls for vent blinking with direct UI calls, relying on the UI's internal throttling.
5.  **Loop Optimization:** Replaced `for...of` loops with standard `for` loops to avoid iterator allocations.

## 2024-07-28 - Optimizing Exchanger Logic and Eliminating Iterator Allocations

**Learning:** The heat exchanger logic in `_processTick` contained an O(N²) bottleneck where `totalHeadroom` was recalculated for every neighbor. Additionally, redundant filtering of `active_vessels` to find vents was occurring every tick despite `active_vents` being pre-calculated. Standard `for...of` loops were also causing minor but frequent iterator allocations in the hot path.

**Action:**
1. Moved `totalHeadroom` calculation outside the neighbor loop in the exchanger block, reducing complexity to O(N) per exchanger.
2. Replaced redundant vent filtering with a direct reference to `this.active_vents`.
3. Replaced all remaining `for...of` loops in `_processTick` with standard indexed `for` loops to eliminate iterator overhead.
4. Inlined the `headroomOf` closure to avoid repeated function creation.

## 2024-07-29 - Optimizing Valve Logic and Convective Boost

**Learning:** Several bottlenecks were identified in the engine tick:
1. **Valve Orientation:** Regex parsing for valve orientation was happening every tick.
2. **Valve Neighbors:** `Array.prototype.sort()` was being used for the common 2-neighbor valve case, and new result objects were being created.
3. **Convective Boost:** A temporary array and four objects were being created for every vent on every tick.
4. **Iterator Allocation:** A remaining `for...of` loop in the outlet processing block was causing minor memory churn.
5. **Redundant Array Operations:** `active_vessels.includes()` and `splice()` were used inside the valve loop for components that do not need vessel-specific processing.

**Action:**
1. **Orientation Caching:** Implemented a `Map` cache for valve orientations.
2. **Neighbor Pooling:** Pre-allocated a `_valveNeighborResult` object and implemented a fast-path for the 2-neighbor case in `_getInputOutputNeighbors`, avoiding `sort()`.
3. **Allocation Removal:** Refactored convective boost calculation to use direct `getTile` calls instead of temporary arrays/objects.
4. **Loop Optimization:** Replaced the final `for...of` loop in `_processTick` with a standard `for` loop.
5. **Removed Redundancy:** Eliminated O(N) `includes`/`splice` calls from the valve processing loop.
6. **Manual Insertion Sort:** Replaced `Array.prototype.sort()` with manual insertion sort for the small `validNeighbors` list in exchanger logic.
