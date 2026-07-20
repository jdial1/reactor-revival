import { describe, it, expect, beforeEach, setupGame } from "../helpers/setup.js";

describe("Meltdown presentation (host chrome)", () => {
  let game;

  beforeEach(async () => {
    game = await setupGame();
  });

  it("presents meltdown from session failure via presentMeltdown", async () => {
    const { presentMeltdown } = await import("@app/bridge/route-session-events.js");
    game.reactor.has_melted_down = true;
    presentMeltdown(game);
    expect(game.state.melting_down).toBe(true);
    expect(game._meltdownPresentationDone).toBe(true);
  });

  it("does not present meltdown from host heat alone", async () => {
    const { presentMeltdown } = await import("@app/bridge/route-session-events.js");
    game.coreBridge.setReactorHeat(game.reactor.max_heat * 2 + 1);
    presentMeltdown(game);
    expect(game.reactor.has_melted_down).toBe(false);
    expect(game._meltdownPresentationDone).toBeFalsy();
  });
});
