import { describe, it, expect, beforeEach, vi } from "vitest";
import { setupGame } from "../helpers/setup.js";

describe("State Manager Mechanics", () => {
  let game;

  beforeEach(async () => {
    game = await setupGame();
  });

  it("should set and get variables correctly", () => {
    game.ui.stateManager.setVar("test_var", 123);
    expect(game.ui.stateManager.getVar("test_var")).toBe(123);
  });

  it("should add variable to UI update queue", () => {
    game.ui.stateManager.setVar("test_var", "abc");
    // Check if update_vars exists and has the expected structure
    expect(game.ui.update_vars.get("test_var")).toBe("abc");
  });

  it("should trigger onToggleStateChange for specific game properties", () => {
    const spy = vi.spyOn(game, "onToggleStateChange");
    game.ui.stateManager.setVar("pause", true);
    expect(spy).toHaveBeenCalledWith("pause", true);
    game.ui.stateManager.setVar("auto_sell", true);
    expect(spy).toHaveBeenCalledWith("auto_sell", true);
  });

  it("should correctly set and get the clicked part", () => {
    const part = game.partset.getPartById("uranium1");
    game.ui.stateManager.setClickedPart(part);
    const clickedPart = game.ui.stateManager.getClickedPart();
    // Test specific properties instead of the whole part object
    expect(clickedPart?.id).toBe(part.id);
    game.ui.stateManager.setClickedPart(null);
    expect(game.ui.stateManager.getClickedPart()).toBeNull();
  });

  it("should reset specific game variables on game_reset", () => {
    game.ui.stateManager.setVar("current_money", 100);
    game.ui.stateManager.setVar("current_power", 100);

    game.ui.stateManager.game_reset();

    expect(game.ui.stateManager.getVar("current_money")).toBe(game.base_money);
    expect(game.ui.stateManager.getVar("current_power")).toBe(0);
    expect(game.ui.stateManager.getVar("current_heat")).toBe(0);
  });

  it("should handle boolean variables correctly", () => {
    game.ui.stateManager.setVar("test_bool", true);
    expect(game.ui.stateManager.getVar("test_bool")).toBe(true);

    game.ui.stateManager.setVar("test_bool", false);
    expect(game.ui.stateManager.getVar("test_bool")).toBe(false);
  });

  it("should handle string variables correctly", () => {
    game.ui.stateManager.setVar("test_string", "hello");
    expect(game.ui.stateManager.getVar("test_string")).toBe("hello");
  });

  it("should handle number variables correctly", () => {
    game.ui.stateManager.setVar("test_number", 123.45);
    expect(game.ui.stateManager.getVar("test_number")).toBe(123.45);
  });

  it("should handle object variables correctly", () => {
    const testObj = { a: 1, b: 2 };
    game.ui.stateManager.setVar("test_obj", testObj);
    const retrievedObj = game.ui.stateManager.getVar("test_obj");
    // Test specific properties to avoid potential large object dumps
    expect(retrievedObj.a).toBe(1);
    expect(retrievedObj.b).toBe(2);
  });

  it("should handle array variables correctly", () => {
    const testArr = [1, 2, 3];
    game.ui.stateManager.setVar("test_arr", testArr);
    const retrievedArr = game.ui.stateManager.getVar("test_arr");
    // Test specific array properties to avoid potential large object dumps
    expect(Array.isArray(retrievedArr)).toBe(true);
    expect(retrievedArr.length).toBe(3);
    expect(retrievedArr[0]).toBe(1);
    expect(retrievedArr[2]).toBe(3);
  });

  it("should handle undefined variables correctly", () => {
    expect(game.ui.stateManager.getVar("undefined_var")).toBeUndefined();
  });

  it("should handle null variables correctly", () => {
    game.ui.stateManager.setVar("null_var", null);
    expect(game.ui.stateManager.getVar("null_var")).toBeNull();
  });

  it("should handle variable updates correctly", () => {
    game.ui.stateManager.setVar("test_var", 123);
    game.ui.stateManager.setVar("test_var", 456);
    expect(game.ui.stateManager.getVar("test_var")).toBe(456);
  });

  it("should not trigger unnecessary updates for same values", () => {
    game.ui.stateManager.setVar("test_var", 123);
    const initialSize = game.ui.update_vars.size;

    // Setting the same value again should not add to update queue
    game.ui.stateManager.setVar("test_var", 123);
    expect(game.ui.update_vars.size).toBe(initialSize);
  });

  it("should return all variables with getAllVars", () => {
    game.ui.stateManager.setVar("var1", "value1");
    game.ui.stateManager.setVar("var2", 42);
    game.ui.stateManager.setVar("var3", true);

    const allVars = game.ui.stateManager.getAllVars();
    expect(allVars.var1).toBe("value1");
    expect(allVars.var2).toBe(42);
    expect(allVars.var3).toBe(true);
  });

  it("should properly initialize with game instance", () => {
    expect(game.ui.stateManager.game).toBe(game);
    expect(game.ui.stateManager.ui).toBe(game.ui);
    expect(game.ui.stateManager.vars).toBeInstanceOf(Map);
  });
});
