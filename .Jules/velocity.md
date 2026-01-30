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
