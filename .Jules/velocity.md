Date - 2024-07-25
Title - Initial Analysis: Array.filter() in Game Loop
Learning - The `_processTick` function in `public/src/core/engine.js` uses `Array.prototype.filter()` multiple times within loops for valves, outlets, and neighbor calculations. This is a classic performance anti-pattern in hot paths, as it allocates a new array on every call, leading to memory pressure and potential garbage collection stalls.
Action - Replace all instances of `.filter()` within `_processTick` with iterative `for` loops to avoid heap allocations during the main game loop. This is a high-impact, low-risk optimization.
