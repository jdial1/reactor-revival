import { describe, it, expect, beforeEach, setupGameLogicOnly, pinEngineToSyncMode } from "../helpers/setup.js";
import { runCheckAffordabilityCore } from "@app/domain/upgrade-affordance.js";
import { TICK_PHASE_ORDER } from "@app/domain/tick-phases.js";

describe("tick pipeline", () => {
  let game;

  beforeEach(async () => {
    game = await setupGameLogicOnly();
    pinEngineToSyncMode(game.engine);
  });

  it("advances tick_count on manual main-thread tick", () => {
    if (!game.engine) return;
    const before = game.engine.tick_count;
    game.engine.manualTick();
    expect(game.engine.tick_count).toBe(before + 1);
  });

  it("exposes ordered tick phases without ui-effects in core module", () => {
    expect(TICK_PHASE_ORDER).toEqual([
      "intents",
      "cells",
      "heat",
      "vents",
      "economy",
      "objectives",
    ]);
  });

  it("computes affordance snapshot without DOM", () => {
    game.upgradeset.check_affordability(game);
    const snapshot = runCheckAffordabilityCore(game.upgradeset, game);
    expect(game.upgradeset.upgradesArray.length).toBeGreaterThan(0);
    expect(snapshot?.hasAnyUpgrade || snapshot?.hasAnyResearch).toBe(true);
  });
});
