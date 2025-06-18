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
    expect(game.ui.stateManager.getClickedPart()).toBe(part);
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
    expect(game.ui.stateManager.getVar("test_obj")).toEqual(testObj);
  });

  it("should handle array variables correctly", () => {
    const testArr = [1, 2, 3];
    game.ui.stateManager.setVar("test_arr", testArr);
    expect(game.ui.stateManager.getVar("test_arr")).toEqual(testArr);
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

  it("should handle variable persistence correctly", () => {
    game.ui.stateManager.setVar("persistent_var", 123, true);
    expect(game.ui.stateManager.getVar("persistent_var")).toBe(123);

    // Simulate game reset
    game.set_defaults();

    expect(game.ui.stateManager.getVar("persistent_var")).toBe(123);
  });

  it("should handle variable callbacks correctly", () => {
    let callbackValue = null;
    game.ui.stateManager.setVar("test_var", 123, false, (value) => {
      callbackValue = value;
    });

    game.ui.stateManager.setVar("test_var", 456);
    expect(callbackValue).toBe(456);
  });

  it("should handle multiple callbacks correctly", () => {
    let callback1Value = null;
    let callback2Value = null;

    game.ui.stateManager.setVar("test_var", 123, false, (value) => {
      callback1Value = value;
    });

    game.ui.stateManager.setVar("test_var", 123, false, (value) => {
      callback2Value = value;
    });

    game.ui.stateManager.setVar("test_var", 456);
    expect(callback1Value).toBe(456);
    expect(callback2Value).toBe(456);
  });

  it("should handle callback removal correctly", () => {
    let callbackValue = null;
    const callback = (value) => {
      callbackValue = value;
    };

    game.ui.stateManager.setVar("test_var", 123, false, callback);
    game.ui.stateManager.setVar("test_var", 456);
    expect(callbackValue).toBe(456);

    game.ui.stateManager.removeCallback("test_var", callback);
    game.ui.stateManager.setVar("test_var", 789);
    expect(callbackValue).toBe(456); // Should not have changed
  });
});
