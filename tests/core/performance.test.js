import { describe, it, expect, beforeEach, vi } from "vitest";
import { setupGame } from "../helpers/setup.js";

describe("Performance Mechanics", () => {
  let game;
  let time = 0; // Mock time

  beforeEach(async () => {
    game = await setupGame();
    time = 0; // Reset mock time for each test
    // Mock performance API with incrementing time
    global.performance = {
      // Return an incrementing value to be more realistic
      now: vi.fn(() => {
        time += 10;
        return time;
      }),
      mark: vi.fn(),
      measure: vi.fn(),
      clearMarks: vi.fn(),
      clearMeasures: vi.fn(),
    };

    // Completely reset performance state for each test
    game.performance.enabled = false;
    game.performance.marks = {};
    game.performance.measures = {};
    game.performance.counters = {};
    game.performance.averages = {};
  });

  it("should initialize with correct default values", () => {
    expect(game.performance.enabled).toBe(false);
    expect(game.performance.marks).toEqual({});
    expect(game.performance.measures).toEqual({});
  });

  it("should enable performance monitoring", () => {
    // Performance is automatically enabled when NODE_ENV is test
    // But we can still test the enable method
    game.performance.disable(); // First disable it
    game.performance.enable();

    expect(game.performance.enabled).toBe(true);
  });

  it("should disable performance monitoring", () => {
    game.performance.enable();
    game.performance.disable();

    expect(game.performance.enabled).toBe(false);
  });

  it("should mark start time", () => {
    const markName = "test_mark";
    game.performance.disable(); // Ensure clean state
    game.performance.enable();

    game.performance.markStart(markName);

    expect(performance.mark).toHaveBeenCalledWith(`${markName}_start`);
    expect(game.performance.marks[markName]).toBeDefined();
  });

  it("should not mark start time when disabled", () => {
    const markName = "test_mark";
    // Ensure performance is disabled
    game.performance.disable();

    // Clear previous mock calls
    performance.mark.mockClear();

    game.performance.markStart(markName);

    expect(performance.mark).not.toHaveBeenCalled();
    expect(game.performance.marks[markName]).toBeUndefined();
  });

  it("should mark end time and measure", () => {
    const markName = "test_mark";
    game.performance.disable(); // Ensure clean state
    game.performance.enable();

    game.performance.markStart(markName);
    game.performance.markEnd(markName);

    // Check both calls to performance.mark
    expect(performance.mark).toHaveBeenCalledTimes(2);
    expect(performance.mark).toHaveBeenNthCalledWith(1, `${markName}_start`);
    expect(performance.mark).toHaveBeenNthCalledWith(2, `${markName}_end`);

    // Check the measure call
    expect(performance.measure).toHaveBeenCalledWith(
      markName,
      `${markName}_start`,
      `${markName}_end`
    );
    expect(game.performance.getMeasure(markName)).toBeDefined();
    expect(game.performance.getMeasure(markName)).toBe(10); // 20 (end) - 10 (start)
  });

  it("should not mark end time when disabled", () => {
    const markName = "test_mark";
    game.performance.enable();
    game.performance.markStart(markName);
    game.performance.disable();

    game.performance.markEnd(markName);

    expect(performance.mark).not.toHaveBeenCalledWith(`${markName}_end`);
    expect(performance.measure).not.toHaveBeenCalled();
  });

  it("should measure time between marks", () => {
    const markName = "test_mark";
    game.performance.disable(); // Ensure clean state
    game.performance.enable();
    game.performance.markStart(markName);
    game.performance.markEnd(markName);

    const measure = game.performance.getMeasure(markName);
    expect(measure).toBeDefined();
    expect(measure).toBe(10); // Should be a value now
  });

  it("should not measure time when disabled", () => {
    const markName = "test_mark";
    // Start with performance disabled from the beginning
    game.performance.disable();

    // Clear previous mock calls
    performance.mark.mockClear();
    performance.measure.mockClear();

    game.performance.markStart(markName);
    game.performance.markEnd(markName);

    const measure = game.performance.getMeasure(markName);

    expect(measure).toBeUndefined();
  });

  it("should clear marks", () => {
    const markName = "test_mark";
    game.performance.enable();
    game.performance.markStart(markName);
    game.performance.markEnd(markName);

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

  it("should get all measures", () => {
    const markName1 = "test_mark_1";
    const markName2 = "test_mark_2";
    game.performance.disable(); // Ensure clean state
    game.performance.enable();
    game.performance.markStart(markName1);
    game.performance.markEnd(markName1);
    game.performance.markStart(markName2);
    game.performance.markEnd(markName2);

    const measures = game.performance.getAllMeasures();
    expect(measures).toHaveProperty(markName1);
    expect(measures[markName1]).toBe(10); // 20 - 10
    expect(measures).toHaveProperty(markName2);
    expect(measures[markName2]).toBe(10); // 40 - 30
  });

  it("should save performance data", () => {
    const markName = "test_mark";
    game.performance.enable();
    game.performance.markStart(markName);
    game.performance.markEnd(markName);

    const savedData = game.performance.saveData();

    expect(savedData).toHaveProperty("marks");
    expect(savedData).toHaveProperty("measures");
  });

  it("should load performance data", () => {
    const savedData = {
      marks: { test_mark: 0 },
      measures: { test_mark: 100 },
    };

    game.performance.loadData(savedData);

    expect(game.performance.marks).toEqual(savedData.marks);
    expect(game.performance.measures).toEqual(savedData.measures);
  });

  it("should handle invalid saved data", () => {
    const invalidData = "invalid";

    expect(() => game.performance.loadData(invalidData)).toThrow();
  });

  it("should reset performance state", () => {
    // Set some performance state
    game.performance.enabled = true;
    game.performance.marks = { test_mark: 0 };
    game.performance.measures = { test_mark: 100 };

    game.performance.reset();

    expect(game.performance.enabled).toBe(false);
    expect(game.performance.marks).toEqual({});
    expect(game.performance.measures).toEqual({});
  });
});
