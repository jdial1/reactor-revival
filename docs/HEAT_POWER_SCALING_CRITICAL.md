# Heat Power Scaling - Critical Game Balance Protection
## Overview
The "Overpressure Fission" upgrade provides a power bonus to cells based on reactor heat. This bonus uses **logarithmic scaling** which is **critical for game balance**. Any attempt to "simplify" this to linear scaling will break the game's progression system.
## The Correct Formula
```javascript
tile.power *= 1 + (this.heat_power_multiplier * (Math.log(this.current_heat) / Math.log(1000) / 100));

The Dangerous "Simplification" (DO NOT USE)

const heatBonus = (this.current_heat / 1000) * (this.heat_power_multiplier / 100);
tile.power *= 1 + heatBonus;

Why Logarithmic Scaling is Critical
1. Prevents Exponential Feedback Loops

    Logarithmic: More heat → small power increase → manageable progression
    Linear: More heat → large power increase → more money → better parts → much more heat → infinite loop

2. Game Balance at Different Heat Levels
Heat Level 	Linear Bonus 	Logarithmic Bonus 	Result
1,000 	0% 	0% 	Base power
2,000 	1% 	0.3% 	Balanced
4,000 	3% 	0.6% 	Balanced
8,000 	7% 	0.9% 	Balanced
16,000 	15% 	1.2% 	Balanced
100,000 	99% 	2.0% 	Critical difference
3. Mathematical Properties

Logarithmic Formula:

    log(heat/1000) / log(1000) / 100
    Provides diminishing returns
    Bounded growth even at extreme heat levels
    Maintains game balance Linear Formula:
    (heat/1000) * (multiplier/100)
    Constant growth rate
    Unbounded at high heat levels
    Breaks game progression

Detection and Prevention
Code Comments

Both src/core/reactor.js and src/core/part.js contain critical comments explaining why logarithmic scaling must be used.
Comprehensive Tests

    tests/core/heat-power-scaling.test.js - Dedicated test suite
    tests/core/reactor.test.js - Additional validation tests

Test Coverage

Tests verify:

    Logarithmic progression - Each heat doubling adds less bonus than the previous
    Diminishing returns - Bonus increments decrease as heat increases
    Bounded growth - Power doesn't explode at extreme heat levels
    Mathematical accuracy - Formula produces expected logarithmic values

Common AI Refactoring Pitfalls
1. "Simplification" Attempts

    AI might see complex logarithmic formula and try to "simplify" it
    Linear formula looks more straightforward and plausible
    Result: Game-breaking exponential feedback loops

2. Performance "Optimization"

    AI might think linear calculation is faster than logarithmic
    Reality: Performance difference is negligible, balance impact is catastrophic

3. "Cleaner Code" Refactoring

    AI might extract the formula into a separate function
    Risk: Function might be rewritten with linear scaling
    Solution: Keep formula inline with critical comments

Implementation Locations
Primary Implementation

    src/core/reactor.js:56 - Main reactor power calculation
    src/core/part.js:278 - Part power calculation

Test Coverage

    tests/core/heat-power-scaling.test.js - Comprehensive validation
    tests/core/reactor.test.js - Integration testing

Code Review Checklist

When reviewing changes to heat power calculations:

    Formula unchanged - Still uses Math.log() and division by Math.log(1000)
    Comments preserved - Critical warnings about logarithmic scaling remain
    Tests pass - All logarithmic scaling tests continue to pass
    No "simplification" - Formula hasn't been "simplified" to linear
    No extraction - Formula hasn't been moved to a separate function without safeguards

Emergency Response

If this formula is accidentally changed to linear scaling:

    Immediate rollback - Revert to logarithmic formula
    Test verification - Run all heat power scaling tests
    Balance check - Verify game progression remains stable
    Documentation update - Strengthen warnings if needed

Conclusion

The logarithmic heat power scaling is a critical game balance mechanism. It prevents exponential feedback loops that would make the game unplayable. Any attempt to "improve" or "simplify" this formula must be rejected unless it maintains the exact same mathematical properties. Remember: The complexity of the logarithmic formula is intentional and necessary for game balance. Simpler is not always better.
