# Reactor Revival Test Suite

This directory contains the comprehensive test suite for Reactor Revival, organized by testing type and purpose.

## Test Structure

### Unit Tests (`/unit/`)
**Purpose**: Test individual components and functions in isolation

#### Core (`/unit/core/`)
- **`game.test.js`** - Core game logic, state management, reboot mechanics, and save/load integration
- **`engine.test.js`** - Game loop, tick processing, and engine performance
- **`heat.test.js`** - Consolidated heat mechanics including auto-control, transfer, venting, and pause behavior
- **`part.test.js`** - Part system including placement, affordability, tier unlocking, and functionality
- **`upgrade.test.js`** - Upgrade system including purchases, dependencies, effects, and EP mechanics

#### Services (`/unit/services/`)
- **`saveLoad.test.js`** - Save/load serialization, data integrity, and auto-save functionality

### Integration Tests (`/integration/`)
**Purpose**: Test interactions between multiple components and complex scenarios

- **`gameplay-scenarios.test.js`** - Complex layouts, neighbor interactions, global boosts, and upgrade chains
- **`pause.test.js`** - All pause-related behavior including resource generation, heat transfer, and complex layouts
- **`objectives.e2e.test.js`** - End-to-end objective system testing
- **`meltdown.test.js`** - Meltdown scenarios and edge cases

### UI Tests (`/ui/`)
**Purpose**: Test user interface components and interactions

- **`interaction.test.js`** - User actions including clicks, hotkeys, copy/paste, and drag/drop
- **`rendering.test.js`** - Component creation, DOM updates, and responsive behavior
- **`navigation.test.js`** - Page routing and transitions
- **`responsive.test.js`** - Responsive design validation

### Validation Tests (`/validation/`)
**Purpose**: Test data integrity and schema validation

- **`data-integrity.test.js`** - Parts and upgrades data validation, duplicate detection, and schema consistency
- **`manifest.test.js`** - PWA manifest validation

### Performance Tests (`/performance/`)
**Purpose**: Stress testing and performance validation

- **`performance.test.js`** - Game engine performance, memory usage, and stress testing

## Running Tests

### All Tests
```bash
npm test
```

### Specific Test Categories
```bash
# Unit tests only
npm test tests/unit/

# Integration tests only
npm test tests/integration/

# UI tests only
npm test tests/ui/

# Performance tests only
npm test tests/performance/
```

### Individual Test Files
```bash
npm test tests/unit/core/game.test.js
npm test tests/integration/gameplay-scenarios.test.js
```

## Test Coverage

The consolidated test suite provides comprehensive coverage of:

- **Core Game Mechanics**: Game loop, state management, resource generation
- **Heat System**: Transfer, venting, auto-control, and pause behavior
- **Part System**: Placement, tier unlocking, affordability, and functionality
- **Upgrade System**: Purchases, dependencies, effects, and EP mechanics
- **UI Interactions**: User input, rendering, and responsive behavior
- **Data Integrity**: Validation, duplicate detection, and schema consistency
- **Performance**: Stress testing, memory usage, and optimization

## Benefits of New Structure

1. **Reduced Redundancy**: Eliminated duplicate tests across multiple files
2. **Clear Organization**: Tests grouped by purpose and testing type
3. **Easier Maintenance**: Related tests consolidated into logical files
4. **Better Coverage**: Comprehensive testing without excessive file fragmentation
5. **Improved Performance**: Faster test execution with consolidated setup

## Migration Notes

The following test files have been consolidated and removed:
- `coverage.test.js` → Data integrity tests moved to `validation/data-integrity.test.js`
- `auto-heat-testing.test.js` → Heat mechanics consolidated in `unit/core/heat.test.js`
- `pause-*.test.js` → All pause behavior consolidated in `integration/pause.test.js`
- `complex-layouts.test.js` → Layout scenarios consolidated in `integration/gameplay-scenarios.test.js`
- `epReboot.test.js` → EP functionality integrated into `unit/core/game.test.js` and `unit/core/upgrade.test.js`

All test cases and assertions have been preserved and enhanced in the new structure. 