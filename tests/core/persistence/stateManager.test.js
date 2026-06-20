import { describe, it, expect, beforeEach, vi, setupGame, toNum } from "../../helpers/setup.js";
import { patchGameState } from "@app/state.js";

describe("State Manager Mechanics", () => {
  let game;

  beforeEach(async () => {
    game = await setupGame();
  });

  it("should update game state when patchGameState is used", () => {
    patchGameState(game, { pause: true });
    expect(game.state.pause).toBe(true);
  });

  it("should trigger onToggleStateChange for toggle keys", () => {
    game.ui.stateManager.setGame(game);
    const spy = vi.spyOn(game, "onToggleStateChange");
    patchGameState(game, { pause: true });
    expect(spy).toHaveBeenCalledWith("pause", true);
    patchGameState(game, { auto_sell: true });
    expect(spy).toHaveBeenCalledWith("auto_sell", true);
  });

  it("should correctly set and get the clicked part", () => {
    const part = game.partset.getPartById("uranium1");
    game.ui.stateManager.setClickedPart(part);
    const clickedPart = game.ui.stateManager.getClickedPart();
    expect(clickedPart?.id).toBe(part.id);
    game.ui.stateManager.setClickedPart(null);
    expect(game.ui.stateManager.getClickedPart()).toBeNull();
  });

  it("should reset specific game variables on game_reset", () => {
    game.ui.stateManager.setGame(game);
    patchGameState(game, { current_money: 100, current_power: 100 });
    game.ui.stateManager.game_reset();
    expect(toNum(game.state.current_money)).toBe(toNum(game.base_money));
    expect(toNum(game.state.current_power)).toBe(0);
    expect(toNum(game.state.current_heat)).toBe(0);
  });

  it("should return game state snapshot with getAllVars", () => {
    game.ui.stateManager.setGame(game);
    const allVars = game.ui.stateManager.getAllVars();
    expect(allVars).toEqual(expect.any(Object));
    expect("pause" in allVars).toBe(true);
    expect("current_money" in allVars).toBe(true);
  });

  it("should properly initialize with game instance", () => {
    game.ui.stateManager.setGame(game);
    expect(game.ui.stateManager.game).toBe(game);
    expect(game.ui.stateManager.ui).toBe(game.ui);
    expect(game.ui.stateManager.getAllVars()).toEqual(expect.any(Object));
  });
});
