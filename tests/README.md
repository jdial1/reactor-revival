# Reactor Revival Test Suite

This directory contains the comprehensive test suite for Reactor Revival, designed to ensure game functionality works correctly across all components.

## Test Structure

- `core/` - Core game logic tests (engine, reactor, parts, upgrades, etc.)
- `ui/` - User interface and DOM interaction tests
- `helpers/` - Test utilities and setup functions
- `objective.test.js` - Objective system tests

## Running Tests

### Standard Test Commands

```bash
# Run all tests with default output
npm test

# Run all tests with clean output (recommended)
npm run test:clean

# Run tests with verbose output (for debugging)
npm run test:verbose

# Run tests in watch mode
npm run test:watch

# Run tests in watch mode with clean output
npm run test:watch:clean

# Run tests with coverage report
npm run test:coverage

# Run tests in UI mode
npm run test:ui
```

### Custom Test Runner

The project includes a custom test runner that provides better error reporting and prevents verbose dumps:

```bash
# Run specific test files
node scripts/test-runner.js tests/core/complex-layouts.test.js

# Run specific test patterns
node scripts/test-runner.js tests/core/

# Run with verbose output
node scripts/test-runner.js --verbose

# Run in watch mode
node scripts/test-runner.js --watch

# Show help
node scripts/test-runner.js --help
```

## Error Output Control

The test suite has been configured to prevent verbose dumps of game state and HTML structure during test failures:

### Features

1. **Console Output Filtering**: Automatically suppresses verbose console.log and console.warn statements
2. **Object Serialization**: Limits object depth and size in error messages
3. **DOM Element Handling**: Replaces DOM objects with descriptive placeholders
4. **Circular Reference Detection**: Prevents infinite loops when serializing objects
5. **Focused Error Messages**: Custom assertion helpers provide targeted error information

### Custom Assertion Helpers

Use the `gameAssertions` object for focused error reporting:

```javascript
import { gameAssertions } from "../helpers/setup.js";

// Instead of verbose console.log + expect
gameAssertions.tileHasPart(tile, "uranium1", "Cell placement failed: ");
gameAssertions.tileHeatLevel(tile, 100, 0.1, "Heat transfer failed: ");
gameAssertions.reactorStats(reactor, { current_power: 1000 }, "Power generation failed: ");
gameAssertions.upgradeLevel(upgrade, 1, "Upgrade activation failed: ");
gameAssertions.moneyAmount(game, 0, 0.1, "Money deduction failed: ");
```

### Custom Expect Matchers

Enhanced expect matchers for game objects:

```javascript
// Clean error messages for common assertions
expect(tile).toHavePart("uranium1");
expect(tile).toHaveHeatLevel(100, 0.1);
expect(upgrade).toHaveUpgradeLevel(1);
```

## Test Configuration

### Environment Variables

- `VITEST_VERBOSE=false` - Suppress verbose console output
- `VITEST_MAX_CONCURRENCY=1` - Run tests sequentially
- `VITEST_OUTPUT_TRUNCATE_LENGTH=80` - Limit output size
- `VITEST_DIFF_LIMIT=1000` - Limit diff output size

### Vitest Configuration

The `vitest.config.mjs` file includes:

- Console output filtering
- Object serialization limits
- Error message truncation
- DOM object handling
- Memory optimization settings

## Writing Tests

### Best Practices

1. **Use Focused Assertions**: Use `gameAssertions` helpers instead of verbose console.log + expect
2. **Avoid Object Dumps**: Don't log entire game state objects
3. **Use Descriptive Messages**: Provide clear error messages in assertions
4. **Test Isolation**: Each test should be independent and not rely on other tests
5. **Clean Setup**: Use the provided setup functions for consistent test environment

### Example Test Structure

```javascript
import { describe, it, expect, beforeEach, vi, afterEach, setupGame, gameAssertions } from "../helpers/setup.js";

describe("Feature Name", () => {
    let game;

    beforeEach(async () => {
        game = await setupGame();
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("should perform expected behavior", async () => {
        // Setup
        const part = game.partset.getPartById("uranium1");
        const tile = game.tileset.getTile(0, 0);
        await tile.setPart(part);

        // Action
        game.engine.tick();

        // Assertions with focused error messages
        gameAssertions.tileHasPart(tile, "uranium1", "Part placement failed: ");
        gameAssertions.tileHeatLevel(tile, 100, 0.1, "Heat generation failed: ");
        
        // Or use custom matchers
        expect(tile).toHavePart("uranium1");
        expect(tile).toHaveHeatLevel(100, 0.1);
    });
});
```

## Debugging Tests

### Enable Verbose Output

```bash
# Run specific test with verbose output
VITEST_VERBOSE=true npm test

# Or use the test runner
npm run test:verbose
```

### Common Issues

1. **Test Isolation**: Ensure tests don't depend on each other
2. **Async Operations**: Use proper async/await patterns
3. **Timer Mocking**: Use `vi.useFakeTimers()` for time-dependent tests
4. **DOM Setup**: Use `setupGameWithDOM()` for UI tests

## Performance

The test suite is optimized for:

- **Memory Usage**: Limited object serialization and cleanup
- **Execution Speed**: Parallel test execution where possible
- **Output Clarity**: Focused error messages without verbose dumps
- **Reliability**: Consistent test environment and isolation

## Contributing

When adding new tests:

1. Follow the existing patterns and structure
2. Use the provided assertion helpers
3. Avoid verbose console output
4. Ensure proper test isolation
5. Add appropriate error messages
6. Update this documentation if needed 