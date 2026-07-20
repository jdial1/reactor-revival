import { describe, it, expect, beforeEach, vi, afterEach, setupGameWithDOM } from "../helpers/setup.js";
import { assertShellStateClass } from "../helpers/testUtils.js";

describe("Reactor Meltdown UI chrome", () => {
  let game;

  beforeEach(async () => {
    const setup = await setupGameWithDOM();
    game = setup.game;
    await game.router.loadPage("reactor_section");
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    if (game?.engine) game.engine.stop();
  });

  it("should prevent page navigation after a meltdown", async () => {
    game.paused = false;
    game.coreBridge.setReactorHeat(game.reactor.max_heat * 2.1);
    game.engine.tick();
    expect(game.reactor.has_melted_down).toBe(true);

    await game.router.loadPage("upgrades_section");
    expect(game.router.currentPageId).not.toBe("upgrades_section");
  });

  it("should display a meltdown banner class on body", () => {
    game.paused = false;
    game.coreBridge.setReactorHeat(game.reactor.max_heat * 2.1);
    game.engine.tick();
    expect(game.reactor.has_melted_down).toBe(true);
    game.ui.meltdownUI.updateMeltdownState();
    assertShellStateClass(game, "reactor-meltdown", "is_melting_down", true);
  });

  it("should clear the meltdown CSS class from body upon reboot", async () => {
    game.paused = false;
    game.coreBridge.setReactorHeat(game.reactor.max_heat * 2.1);
    game.engine.tick();
    expect(game.reactor.has_melted_down).toBe(true);
    game.ui.meltdownUI?.updateMeltdownState?.();
    assertShellStateClass(game, "reactor-meltdown", "is_melting_down", true);

    await game.rebootActionDiscardExoticParticles();
    expect(game.reactor.has_melted_down).toBe(false);
    expect(game.state.melting_down).toBe(false);
    game.ui.meltdownUI?.updateMeltdownState?.();
    assertShellStateClass(game, "reactor-meltdown", "is_melting_down", false);
  }, 30000);
});
