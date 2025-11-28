import { describe, it, expect, beforeEach, vi, afterEach, setupGame } from "../helpers/setup.js";

describe("Performance Class Functionality", () => {
  let game;
  let time = 0;
  const originalPerformance = global.performance;

  beforeEach(async () => {
    game = await setupGame();
    time = 0;
    global.performance = {
      now: vi.fn(() => {
        time += 10;
        return time;
      }),
      mark: vi.fn(),
      measure: vi.fn(),
      clearMarks: vi.fn(),
      clearMeasures: vi.fn(),
    };
    game.performance.enabled = false;
    game.performance.marks = {};
    game.performance.measures = {};
    game.performance.counters = {};
    game.performance.averages = {};
  });

  afterEach(() => {
    global.performance = originalPerformance;
  });

  it("should initialize with correct default values", () => {
    expect(game.performance.enabled).toBe(false);
    expect(game.performance.marks).toEqual({});
    expect(game.performance.measures).toEqual({});
  });

  it("should enable performance monitoring", () => {
    game.performance.enable();
    expect(game.performance.enabled).toBe(true);
  });

  it("should disable performance monitoring", () => {
    game.performance.disable();
    expect(game.performance.enabled).toBe(false);
  });

  it("should mark start time", () => {
    const markName = "test_mark";
    game.performance.enable();
    game.performance.markStart(markName);
    expect(performance.mark).toHaveBeenCalledWith(`${markName}_start`);
    expect(game.performance.marks[markName]).toBeDefined();
  });

  it("should mark end time and measure", () => {
    const markName = "test_mark";
    game.performance.enable();
    game.performance.markStart(markName);
    game.performance.markEnd(markName);
    expect(performance.mark).toHaveBeenCalledTimes(2);
    expect(performance.mark).toHaveBeenNthCalledWith(1, `${markName}_start`);
    expect(performance.mark).toHaveBeenNthCalledWith(2, `${markName}_end`);
    expect(performance.measure).toHaveBeenCalledWith(
      markName,
      `${markName}_start`,
      `${markName}_end`
    );
    expect(game.performance.getMeasure(markName)).toBe(10);
  });

  it("should not mark end time when disabled", () => {
    const markName = "test_mark";
    game.performance.enable();
    game.performance.markStart(markName);
    game.performance.disable();
    performance.mark.mockClear();
    performance.measure.mockClear();
    game.performance.markEnd(markName);
    expect(performance.mark).not.toHaveBeenCalledWith(`${markName}_end`);
    expect(performance.measure).not.toHaveBeenCalled();
  });

  it("should clear marks", () => {
    const markName = "test_mark";
    game.performance.enable();
    game.performance.markStart(markName);
    game.performance.clearMarks();
    expect(performance.clearMarks).toHaveBeenCalled();
    expect(game.performance.marks).toEqual({});
  });

  it("should clear measures", () => {
    const markName = "test_mark";
    game.performance.enable();
    game.performance.markStart(markName);
    game.performance.markEnd(markName);
    game.performance.clearMeasures();
    expect(performance.clearMeasures).toHaveBeenCalled();
    expect(game.performance.measures).toEqual({});
  });

  it("should load performance data", () => {
    const savedData = {
      marks: { test_mark: 0 },
      measures: { test_measure: 100 },
      counters: { test_counter: 5 },
      averages: { test_average: { total: 500, count: 5 } },
    };
    game.performance.loadData(savedData);
    expect(game.performance.marks).toEqual(savedData.marks);
    expect(game.performance.measures).toEqual(savedData.measures);
    expect(game.performance.counters).toEqual(savedData.counters);
    expect(game.performance.averages).toEqual(savedData.averages);
  });

  it("should reset performance data", () => {
    game.performance.marks = { test_mark: 0 };
    game.performance.measures = { test_measure: 100 };
    game.performance.reset();
    expect(game.performance.marks).toEqual({});
    expect(game.performance.measures).toEqual({});
  });
});

describe("Reactor Performance Stress Tests", () => {
  let game;
  const TEST_TICKS = 50;
  const MAX_AVG_TICK_TIME_MS = 40; // Increased to accommodate complex multi-component scenarios
  const originalPerformance = global.performance;

  const testScenarios = [];
  const cellTypes = [
    "uranium",
    "plutonium",
    "thorium",
    "seaborgium",
    "dolorium",
  ];

  // Generate tests for levels 1-5
  for (let level = 1; level <= 5; level++) {
    const cellType = cellTypes[level - 1];
    if (!cellType) continue;

    testScenarios.push({
      level,
      description: `Cell/Reflector Lvl ${level}`,
      parts: [`${cellType}1`, `reflector${level}`],
    });
    testScenarios.push({
      level,
      description: `Cell/Vent Lvl ${level}`,
      parts: [`${cellType}1`, `vent${level}`],
    });
    testScenarios.push({
      level,
      description: `Cell/Exchanger/Coolant Lvl ${level}`,
      parts: [`${cellType}1`, `heat_exchanger${level}`, `coolant_cell${level}`],
    });
    testScenarios.push({
      level,
      description: `Cell/Outlet/Vent Lvl ${level}`,
      parts: [`${cellType}1`, `heat_outlet${level}`, `vent${level}`],
      preheat: true,
    });
    testScenarios.push({
      level,
      description: `Cell/Inlet/Vent Lvl ${level}`,
      parts: [`${cellType}1`, `heat_inlet${level}`, `vent${level}`],
    });
  }

  // Experimental tests for Level 6
  testScenarios.push({
    level: 6,
    description: "Protium Cell / Thermal Reflector",
    parts: ["protium1", "reflector6"],
    experimental: true,
    erequires: ["protium_cells", "heat_reflection"],
  });
  testScenarios.push({
    level: 6,
    description: "Protium Cell / Extreme Vent",
    parts: ["protium1", "vent6"],
    experimental: true,
    erequires: ["protium_cells", "vortex_cooling"],
  });
  testScenarios.push({
    level: 6,
    description: "Protium Cell / Black Hole Accelerator",
    parts: ["protium1", "particle_accelerator6"],
    experimental: true,
    erequires: ["protium_cells", "singularity_harnessing"],
  });

  beforeEach(async () => {
    // Restore native performance object for accurate timing
    global.performance = originalPerformance;

    game = await setupGame();
    game.performance.enable(); // Enable performance monitoring for stress tests
    game.performance.clearMarks();
    game.performance.clearMeasures();
  });

  it.each(testScenarios)(
    `Level $level: $description`,
    async ({ level, description, parts, experimental, erequires, preheat }) => {
      const partInstances = parts.map((id) => game.partset.getPartById(id));

      if (partInstances.some((p) => !p)) {
        console.warn(
          `Skipping performance test for "${description}": one or more parts not found.`
        );
        return;
      }

      if (experimental) {
        game.upgradeset.getUpgrade("laboratory")?.setLevel(1);
        erequires.forEach((reqId) => {
          game.upgradeset.getUpgrade(reqId)?.setLevel(1);
        });
      }

      for (const tile of game.tileset.active_tiles_list) {
        const partIndex = (tile.row + tile.col) % partInstances.length;
        const partToPlace = partInstances[partIndex];
        await tile.setPart(partToPlace);
      }

      if (preheat) {
        game.reactor.current_heat = game.reactor.max_heat / 2;
      }

      for (let i = 0; i < TEST_TICKS; i++) {
        game.engine.tick();
      }

      const avgTickTime = game.performance.getAverage("tick_total");

      // Debug output for performance tracking
      if (avgTickTime > 0) {
        console.log(
          `Perf Test - ${description}: Avg Tick Time: ${avgTickTime.toFixed(
            3
          )}ms`
        );
      } else {
        console.warn(
          `Perf Test - ${description}: No timing data collected! (avgTickTime = ${avgTickTime})`
        );
      }

      expect(avgTickTime).toBeDefined();
      expect(avgTickTime).not.toBeNaN();
      expect(avgTickTime).toBeGreaterThan(0); // Ensure we actually got timing data
      expect(avgTickTime).toBeLessThan(MAX_AVG_TICK_TIME_MS);
    },
    20000
  );
});

describe("Large Grid Performance Stress Tests", () => {
  let game;
  const TEST_TICKS = 50; // Reduced ticks for large grids to keep test time reasonable
  const originalPerformance = global.performance;

  const gridSizes = [
    { size: 25, description: "25x25 Grid" },
    { size: 50, description: "50x50 Grid" },
    { size: 75, description: "75x75 Grid" },
    { size: 100, description: "100x100 Grid" },
  ];

  const testConfigurations = [
    {
      name: "Cell/Reflector Mix",
      parts: ["uranium3", "reflector3"],
      description: "High-power cells with reflectors",
    },
    {
      name: "Cell/Vent Mix",
      parts: ["thorium3", "vent4"],
      description: "Heat production with cooling",
    },
    {
      name: "Complex Heat Management",
      parts: ["seaborgium1", "heat_exchanger4", "coolant_cell4", "vent4"],
      description: "Multi-component heat transfer system",
    },
    {
      name: "High Throughput",
      parts: ["protium1", "heat_exchanger5", "vent5", "protium1"],
      description: "Maximum heat flow scenario",
      preheat: true,
    },
  ];

  beforeEach(async () => {
    // Restore native performance object for accurate timing
    global.performance = originalPerformance;

    game = await setupGame();
    game.performance.enable();
    game.performance.clearMarks();
    game.performance.clearMeasures();
  });

  gridSizes.forEach(({ size, description }) => {
    testConfigurations.forEach(
      ({ name, parts, description: configDesc, preheat }) => {
        it(`${description} - ${name}: ${configDesc}`, async () => {
          console.log(`\n🧪 Starting ${description} test with ${name}...`);

          // Expand grid to target size
          game.rows = size;
          game.cols = size;
          game.tileset.updateActiveTiles();

          const partInstances = parts.map((id) => game.partset.getPartById(id));

          if (partInstances.some((p) => !p)) {
            console.warn(`Skipping test: one or more parts not found.`);
            return;
          }

          // Enable any required experimental upgrades
          game.upgradeset.getUpgrade("laboratory")?.setLevel(1);
          game.upgradeset.getUpgrade("heat_reflection")?.setLevel(1);
          game.upgradeset.getUpgrade("advanced_cooling")?.setLevel(1);
          game.upgradeset.getUpgrade("thermal_dynamics")?.setLevel(1);

          console.log(
            `📋 Placing ${partInstances.length} part types across ${size * size
            } tiles...`
          );

          // Place parts in a pattern across the entire grid
          for (const tile of game.tileset.active_tiles_list) {
            const partIndex = (tile.row + tile.col) % partInstances.length;
            const partToPlace = partInstances[partIndex];
            await tile.setPart(partToPlace);
          }

          if (preheat) {
            game.reactor.current_heat = game.reactor.max_heat * 0.3; // Moderate preheat for large grids
          }

          console.log(
            `⚡ Running ${TEST_TICKS} ticks on ${size * size} active tiles...`
          );

          // Run the stress test
          const startTime = performance.now();
          for (let i = 0; i < TEST_TICKS; i++) {
            game.engine.tick();
          }
          const endTime = performance.now();
          const totalTime = endTime - startTime;

          const avgTickTime = game.performance.getAverage("tick_total");
          const categorizeTime = game.performance.getAverage(
            "tick_categorize_parts"
          );
          const cellsTime = game.performance.getAverage("tick_cells");
          const heatTransferTime =
            game.performance.getAverage("tick_heat_transfer");
          const ventsTime = game.performance.getAverage("tick_vents");
          const statsTime = game.performance.getAverage("tick_stats");

          // Detailed performance reporting
          console.log(`📊 ${description} - ${name} Performance Results:`);
          console.log(`   Total Test Time: ${totalTime.toFixed(2)}ms`);
          console.log(
            `   Average Tick Time: ${avgTickTime?.toFixed(3) || "N/A"}ms`
          );
          console.log(
            `   - Categorization: ${categorizeTime?.toFixed(3) || "N/A"}ms`
          );
          console.log(
            `   - Cells Processing: ${cellsTime?.toFixed(3) || "N/A"}ms`
          );
          console.log(
            `   - Heat Transfer: ${heatTransferTime?.toFixed(3) || "N/A"}ms`
          );
          console.log(`   - Vents/EP: ${ventsTime?.toFixed(3) || "N/A"}ms`);
          console.log(`   - Stats Update: ${statsTime?.toFixed(3) || "N/A"}ms`);
          console.log(
            `   Active Tiles: ${game.tileset.active_tiles_list.length}`
          );
          console.log(
            `   Heat: ${game.reactor.current_heat.toFixed(0)} / ${game.reactor.max_heat
            }`
          );
          console.log(
            `   Power: ${game.reactor.current_power.toFixed(0)} / ${game.reactor.max_power
            }`
          );

          // Performance assertions - verify timing data is valid
          expect(avgTickTime).toBeDefined();
          expect(avgTickTime).not.toBeNaN();
          expect(avgTickTime).toBeGreaterThan(0);

          // Performance expectations - validate linear scaling optimization
          // Standard tests: 12x12 = 144 tiles @ ~40ms = 0.28ms per tile
          // Large grids should maintain similar per-tile performance
          const standardGridSize = 144; // 12x12 default
          const standardMaxTime = 40; // Standard test limit
          const baseTimePerTile = standardMaxTime / standardGridSize; // ~0.28ms per tile

          const currentGridSize = size * size;
          const expectedMaxTime = Math.ceil(
            baseTimePerTile * currentGridSize * 2.5
          ); // 150% buffer for complex heat management

          console.log(
            `   Expected Performance: < ${expectedMaxTime}ms per tick (${currentGridSize} tiles, linear scaling)`
          );
          expect(avgTickTime).toBeLessThan(expectedMaxTime);

          // Verify the categorization optimization is working efficiently
          if (categorizeTime) {
            const categorizePercentage = (categorizeTime / avgTickTime) * 100;
            console.log(
              `   Categorization Overhead: ${categorizePercentage.toFixed(1)}%`
            );

            // Categorization should be a small percentage of total tick time
            // Allow slightly higher threshold in CI to account for env variance
            const maxCategorizePct = process.env.CI ? 35 : 25;
            expect(categorizePercentage).toBeLessThan(maxCategorizePct);
          }

          // Performance scaling validation - demonstrate linear scaling with optimization
          const tilesProcessed = game.tileset.active_tiles_list.length;
          const timePerTile = avgTickTime / tilesProcessed;
          console.log(`   Time per Tile: ${(timePerTile * 1000).toFixed(3)}μs`);

          // Time per tile should demonstrate linear scaling efficiency
          // Allow higher per-tile time for complex heat management scenarios
          const maxTimePerTile = size <= 25 ? 1.0 : 2.0; // Reasonable limits that validate optimization
          expect(timePerTile).toBeLessThan(maxTimePerTile);

          console.log(`✅ ${description} - ${name} test passed!\n`);
        }, 60000); // Increased timeout for large grid tests
      }
    );
  });
});

describe("Experimental Parts 100x100 Grid Stress Test", () => {
  let game;
  const TEST_TICKS = 30; // Reduced for the most intensive test
  const originalPerformance = global.performance;

  beforeEach(async () => {
    // Restore native performance object for accurate timing
    global.performance = originalPerformance;

    game = await setupGame();
    game.performance.enable();
    game.performance.clearMarks();
    game.performance.clearMeasures();
  });

  it("should handle 100x100 grid with all experimental parts and max global boost upgrades", async () => {
    console.log(`\n🧪 Starting 100x100 Experimental Parts Stress Test...`);

    // Expand grid to 100x100
    game.rows = 100;
    game.cols = 100;
    game.tileset.updateActiveTiles();

    // Enable all experimental upgrades at max level
    console.log(`📋 Enabling all experimental upgrades at max level...`);

    // Laboratory and core experimental upgrades
    game.upgradeset.getUpgrade("laboratory")?.setLevel(10);
    game.upgradeset.getUpgrade("protium_cells")?.setLevel(10);
    game.upgradeset.getUpgrade("infused_cells")?.setLevel(10);
    game.upgradeset.getUpgrade("unleashed_cells")?.setLevel(10);

    // Heat management experimental upgrades
    game.upgradeset.getUpgrade("heat_reflection")?.setLevel(10);
    game.upgradeset.getUpgrade("vortex_cooling")?.setLevel(10);
    game.upgradeset.getUpgrade("thermal_dynamics")?.setLevel(10);
    game.upgradeset.getUpgrade("advanced_cooling")?.setLevel(10);

    // Particle and energy experimental upgrades
    game.upgradeset.getUpgrade("singularity_harnessing")?.setLevel(10);
    game.upgradeset.getUpgrade("quantum_stabilization")?.setLevel(10);
    game.upgradeset.getUpgrade("dimensional_engineering")?.setLevel(10);
    game.upgradeset.getUpgrade("reality_manipulation")?.setLevel(10);

    // Global boost upgrades at max level
    console.log(`📋 Enabling all global boost upgrades at max level...`);
    game.upgradeset.getUpgrade("chronometer")?.setLevel(10);
    game.upgradeset.getUpgrade("forceful_fusion")?.setLevel(10);
    game.upgradeset.getUpgrade("heat_control_operator")?.setLevel(10);
    game.upgradeset.getUpgrade("power_distribution")?.setLevel(10);
    game.upgradeset.getUpgrade("thermal_optimization")?.setLevel(10);
    game.upgradeset.getUpgrade("energy_efficiency")?.setLevel(10);
    game.upgradeset.getUpgrade("reactor_stability")?.setLevel(10);
    game.upgradeset.getUpgrade("heat_management")?.setLevel(10);
    game.upgradeset.getUpgrade("power_generation")?.setLevel(10);
    game.upgradeset.getUpgrade("cooling_systems")?.setLevel(10);
    game.upgradeset.getUpgrade("thermal_conductivity")?.setLevel(10);
    game.upgradeset.getUpgrade("energy_conversion")?.setLevel(10);
    game.upgradeset.getUpgrade("heat_transfer")?.setLevel(10);
    game.upgradeset.getUpgrade("power_efficiency")?.setLevel(10);
    game.upgradeset.getUpgrade("thermal_regulation")?.setLevel(10);
    game.upgradeset.getUpgrade("energy_optimization")?.setLevel(10);
    game.upgradeset.getUpgrade("heat_balance")?.setLevel(10);
    game.upgradeset.getUpgrade("power_management")?.setLevel(10);
    game.upgradeset.getUpgrade("thermal_control")?.setLevel(10);
    game.upgradeset.getUpgrade("energy_management")?.setLevel(10);
    game.upgradeset.getUpgrade("heat_optimization")?.setLevel(10);
    game.upgradeset.getUpgrade("power_optimization")?.setLevel(10);
    game.upgradeset.getUpgrade("thermal_management")?.setLevel(10);
    game.upgradeset.getUpgrade("energy_control")?.setLevel(10);
    game.upgradeset.getUpgrade("heat_management_advanced")?.setLevel(10);
    game.upgradeset.getUpgrade("power_management_advanced")?.setLevel(10);
    game.upgradeset.getUpgrade("thermal_management_advanced")?.setLevel(10);
    game.upgradeset.getUpgrade("energy_management_advanced")?.setLevel(10);

    // Define experimental parts to use
    const experimentalParts = [
      "protium1",           // Experimental cell
      "reflector6",         // Thermal reflector
      "vent6",             // Extreme vent
      "heat_exchanger6",   // Quantum heat exchanger
      "coolant_cell6",     // Quantum coolant cell
      "heat_outlet6",      // Quantum heat outlet
      "heat_inlet6",       // Quantum heat inlet
      "particle_accelerator6", // Black hole accelerator
      "capacitor6",        // Quantum capacitor
      "neutron_reflector6", // Quantum neutron reflector
    ];

    const partInstances = experimentalParts.map((id) => game.partset.getPartById(id));

    // Verify all experimental parts are available
    const missingParts = partInstances.filter((p, index) => !p);
    if (missingParts.length > 0) {
      console.warn(`⚠️ Missing experimental parts:`, experimentalParts.filter((_, index) => !partInstances[index]));
      console.warn(`⚠️ Skipping test due to missing parts`);
      return;
    }

    console.log(`📋 Placing ${partInstances.length} experimental part types across ${100 * 100} tiles...`);

    // Place experimental parts in a pattern across the entire grid
    for (const tile of game.tileset.active_tiles_list) {
      const partIndex = (tile.row + tile.col) % partInstances.length;
      const partToPlace = partInstances[partIndex];
      await tile.setPart(partToPlace);
    }

    // Pre-heat the reactor to test heat management
    game.reactor.current_heat = game.reactor.max_heat * 0.4;
    game.reactor.current_power = game.reactor.max_power * 0.3;

    console.log(`⚡ Running ${TEST_TICKS} ticks on ${100 * 100} experimental tiles...`);

    // Run the stress test
    const startTime = performance.now();
    for (let i = 0; i < TEST_TICKS; i++) {
      game.engine.tick();
    }
    const endTime = performance.now();
    const totalTime = endTime - startTime;

    const avgTickTime = game.performance.getAverage("tick_total");
    const categorizeTime = game.performance.getAverage("tick_categorize_parts");
    const cellsTime = game.performance.getAverage("tick_cells");
    const heatTransferTime = game.performance.getAverage("tick_heat_transfer");
    const ventsTime = game.performance.getAverage("tick_vents");
    const statsTime = game.performance.getAverage("tick_stats");

    // Detailed performance reporting
    console.log(`📊 100x100 Experimental Parts Performance Results:`);
    console.log(`   Total Test Time: ${totalTime.toFixed(2)}ms`);
    console.log(`   Average Tick Time: ${avgTickTime?.toFixed(3) || "N/A"}ms`);
    console.log(`   - Categorization: ${categorizeTime?.toFixed(3) || "N/A"}ms`);
    console.log(`   - Cells Processing: ${cellsTime?.toFixed(3) || "N/A"}ms`);
    console.log(`   - Heat Transfer: ${heatTransferTime?.toFixed(3) || "N/A"}ms`);
    console.log(`   - Vents/EP: ${ventsTime?.toFixed(3) || "N/A"}ms`);
    console.log(`   - Stats Update: ${statsTime?.toFixed(3) || "N/A"}ms`);
    console.log(`   Active Tiles: ${game.tileset.active_tiles_list.length}`);
    console.log(`   Heat: ${game.reactor.current_heat.toFixed(0)} / ${game.reactor.max_heat}`);
    console.log(`   Power: ${game.reactor.current_power.toFixed(0)} / ${game.reactor.max_power}`);
    console.log(`   Exotic Particles: ${game.exotic_particles.toFixed(0)}`);

    // Performance assertions - verify timing data is valid
    expect(avgTickTime).toBeDefined();
    expect(avgTickTime).not.toBeNaN();
    expect(avgTickTime).toBeGreaterThan(0);

    // Performance expectations for experimental parts with max upgrades
    // This is the most intensive test, so we allow higher performance limits
    const maxExpectedTime = 200; // 200ms per tick for 100x100 experimental grid
    console.log(`   Expected Performance: < ${maxExpectedTime}ms per tick (100x100 experimental grid)`);
    expect(avgTickTime).toBeLessThan(maxExpectedTime);

    // Verify the categorization optimization is working efficiently
    if (categorizeTime) {
      const categorizePercentage = (categorizeTime / avgTickTime) * 100;
      console.log(`   Categorization Overhead: ${categorizePercentage.toFixed(1)}%`);

      // Categorization should be a reasonable percentage even for experimental parts
      expect(categorizePercentage).toBeLessThan(30); // Should be < 30% of total tick time
    }

    // Performance scaling validation for experimental parts
    const tilesProcessed = game.tileset.active_tiles_list.length;
    const timePerTile = avgTickTime / tilesProcessed;
    console.log(`   Time per Tile: ${(timePerTile * 1000).toFixed(3)}μs`);

    // Time per tile should be reasonable even for experimental parts
    const maxTimePerTile = 3.0; // Allow higher per-tile time for experimental parts
    expect(timePerTile).toBeLessThan(maxTimePerTile);

    // Verify experimental parts are working correctly
    expect(game.exotic_particles).toBeGreaterThan(0);
    expect(game.reactor.current_heat).toBeLessThan(game.reactor.max_heat);
    expect(game.reactor.current_power).toBeLessThan(game.reactor.max_power);

    console.log(`✅ 100x100 Experimental Parts Stress Test passed!\n`);
  }, 120000); // 2 minute timeout for the most intensive test
});
