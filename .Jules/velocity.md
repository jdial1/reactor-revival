# Velocity's Journal - Critical Performance Learnings

## 2024-07-26 - Memory Churn in `_processTick` from Array Methods

**Learning:** The core game loop in `public/src/core/engine.js` (`_processTick`) was using `Array.prototype.filter()` on every frame for heat transfer logic. This created new, temporary arrays multiple times per tick, leading to unnecessary memory allocations and putting pressure on the garbage collector, which can cause frame rate stutter.

**Action:** Replaced all instances of `.filter()` in the hot path with `for` loops to iterate and populate new arrays, and used `indexOf`/`splice` for in-place removal. This avoids creating new arrays in the loop, resulting in a more stable memory profile and smoother frame rate.
