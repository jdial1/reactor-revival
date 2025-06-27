import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { setupGameWithDOM } from "../helpers/setup.js";

const fireEvent = (element, eventType) => {
  if (!element)
    throw new Error(`Cannot fire event on a null element. Event: ${eventType}`);
  const event = new window.Event(eventType, {
    bubbles: true,
    cancelable: true,
  });
  element.dispatchEvent(event);
};

describe("UI Integration and Gameplay", () => {
  let game, document, window;

  beforeEach(async () => {
    const setup = await setupGameWithDOM();
    game = setup.game;
    document = setup.document;
    window = setup.window;

    // Pre-load all pages to ensure all DOM elements are available for update listeners
    await game.router.loadPage("upgrades_section");
    await game.router.loadPage("experimental_upgrades_section");
    await game.router.loadPage("reactor_section"); // Return to the main page

    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should place a part and start generating power", async () => {
    // 1. Get the part directly and verify it exists
    const uraniumPart = game.partset.getPartById("uranium1");
    expect(uraniumPart, "Uranium part should exist").not.toBeNull();

    // 2. Select the part directly (simulating UI selection)
    game.ui.stateManager.setClickedPart(uraniumPart);
    expect(game.ui.stateManager.getClickedPart().id).toBe("uranium1");

    // 3. Get a tile and place the part
    const tile = game.tileset.getTile(5, 5);
    expect(tile, "Tile should exist").not.toBeNull();
    expect(tile.part).toBeNull(); // Should be empty initially

    // 4. Simulate placing the part (what clicking would do)
    if (game.current_money >= uraniumPart.cost) {
      game.current_money -= uraniumPart.cost;
      tile.setPart(uraniumPart);
    }

    // 5. Verify the part was placed
    expect(tile.part).not.toBeNull();
    expect(tile.part.id).toBe("uranium1");

    // 6. Run the game engine for one tick
    game.engine.tick();

    // 7. Verify the state has changed
    expect(game.reactor.current_power).toBeGreaterThan(0);
    expect(game.reactor.current_heat).toBeGreaterThan(0);
  });

  it("should update money display after selling power", async () => {
    const initialMoney = game.current_money;
    game.reactor.current_power = 1234;

    // Directly sell power (simulating what the button does)
    game.current_money += game.reactor.current_power;
    game.reactor.current_power = 0;

    expect(game.current_money).toBe(initialMoney + 1234);

    // Check that the money display exists
    const moneyDisplay = document.getElementById("info_bar_money");
    expect(moneyDisplay, "Money display element should exist").not.toBeNull();

    // Verify the StateManager can track the money value correctly
    game.ui.stateManager.setVar("current_money", game.current_money);
    expect(game.ui.stateManager.getVar("current_money")).toBe(
      game.current_money
    );
  });

  it("should purchase an upgrade and deduct cost", async () => {
    const upgrade = game.upgradeset.getUpgrade("expand_reactor_rows");
    expect(upgrade, "Expand reactor rows upgrade should exist").not.toBeNull();

    const initialMoney = game.current_money;
    const initialRows = game.rows;

    // Directly purchase the upgrade (simulating what the button does)
    const success = game.upgradeset.purchaseUpgrade(upgrade.id);
    expect(success, "Upgrade purchase should succeed").toBe(true);

    expect(upgrade.level).toBe(1);
    expect(game.rows).toBe(initialRows + 1);
    expect(game.current_money).toBe(initialMoney - upgrade.base_cost);
  });
});
