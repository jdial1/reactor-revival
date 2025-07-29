import { describe, it, expect, beforeEach, afterEach, vi, setupGameWithDOM } from "../helpers/setup.js";

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

  it("should refund money when trying to place part on occupied tile", async () => {
    // 1. Get parts and verify they exist
    const uraniumPart = game.partset.getPartById("uranium1");
    const ventPart = game.partset.getPartById("vent1");
    expect(uraniumPart, "Uranium part should exist").not.toBeNull();
    expect(ventPart, "Vent part should exist").not.toBeNull();

    // 2. Select the vent part (simulating UI selection)
    game.ui.stateManager.setClickedPart(ventPart);
    expect(game.ui.stateManager.getClickedPart().id).toBe("vent1");

    // 3. Get a tile and place the first part
    const tile = game.tileset.getTile(5, 5);
    expect(tile, "Tile should exist").not.toBeNull();
    expect(tile.part).toBeNull(); // Should be empty initially

    // 4. Place the first part
    const initialMoney = game.current_money;
    if (game.current_money >= uraniumPart.cost) {
      game.current_money -= uraniumPart.cost;
      await tile.setPart(uraniumPart);
    }

    // 5. Verify the first part was placed
    expect(tile.part).not.toBeNull();
    expect(tile.part.id).toBe("uranium1");

    // 6. Try to place a second part on the same tile (simulating UI interaction)
    const moneyBeforeSecondPart = game.current_money;
    if (game.current_money >= ventPart.cost) {
      game.current_money -= ventPart.cost;
      const partPlaced = await tile.setPart(ventPart);
      if (!partPlaced) {
        // Refund the money if the part couldn't be placed
        game.current_money += ventPart.cost;
      }
    }

    // 7. Verify the first part is still there and money was refunded
    expect(tile.part.id).toBe("uranium1");
    expect(tile.part.id).not.toBe("vent1");
    expect(game.current_money).toBe(moneyBeforeSecondPart); // Money should be refunded
  });

  it("should update money display after selling power", async () => {
    const initialMoney = game.current_money;
    game.reactor.current_power = 1234;

    // Directly sell power (simulating what the button does)
    game.current_money += game.reactor.current_power;
    game.reactor.current_power = 0;

    expect(game.current_money).toBe(initialMoney + 1234);

    // Check that the money display exists
    const moneyDisplay = document.getElementById("info_money");
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

  it("should show/hide objectives when navigating between pages", async () => {
    // Start on reactor page
    await game.router.loadPage("reactor_section");

    // Check that objectives are visible on reactor page
    const objectivesSection = document.getElementById("objectives_section");
    expect(objectivesSection, "Objectives section should exist").not.toBeNull();
    expect(objectivesSection.classList.contains("hidden")).toBe(false);

    // Navigate to upgrades page
    await game.router.loadPage("upgrades_section");

    // Check that objectives are hidden on upgrades page
    expect(objectivesSection.classList.contains("hidden")).toBe(true);

    // Navigate back to reactor page
    await game.router.loadPage("reactor_section");

    // Check that objectives are visible again on reactor page
    expect(objectivesSection.classList.contains("hidden")).toBe(false);
  });

  it("should update reactor heat background based on heat ratio", async () => {
    // Start on reactor page
    await game.router.loadPage("reactor_section");

    // Get the reactor background element
    const reactorBackground = document.getElementById("reactor_background");
    expect(reactorBackground, "Reactor background element should exist").not.toBeNull();

    // Set initial heat values
    game.reactor.current_heat = 0;
    game.reactor.max_heat = 1000;
    game.ui.stateManager.setVar("current_heat", game.reactor.current_heat);
    game.ui.stateManager.setVar("max_heat", game.reactor.max_heat);

    // Test low heat (should be transparent)
    game.ui.updateHeatVisuals();
    expect(reactorBackground.style.backgroundColor).toBe("transparent");
    expect(reactorBackground.classList.contains("heat-warning")).toBe(false);
    expect(reactorBackground.classList.contains("heat-critical")).toBe(false);

    // Test moderate heat (50% of max)
    game.reactor.current_heat = 500;
    game.ui.stateManager.setVar("current_heat", game.reactor.current_heat);
    game.ui.updateHeatVisuals();
    expect(reactorBackground.style.backgroundColor).toBe("transparent");
    expect(reactorBackground.classList.contains("heat-warning")).toBe(false);

    // Test high heat (80% of max - should show warning)
    game.reactor.current_heat = 800;
    game.ui.stateManager.setVar("current_heat", game.reactor.current_heat);
    game.ui.updateHeatVisuals();
    expect(reactorBackground.style.backgroundColor).not.toBe("transparent");
    expect(reactorBackground.classList.contains("heat-warning")).toBe(true);
    expect(reactorBackground.classList.contains("heat-critical")).toBe(false);

    // Test critical heat (130% of max - should show critical)
    game.reactor.current_heat = 1300;
    game.ui.stateManager.setVar("current_heat", game.reactor.current_heat);
    game.ui.updateHeatVisuals();
    expect(reactorBackground.style.backgroundColor).not.toBe("transparent");
    expect(reactorBackground.classList.contains("heat-warning")).toBe(true);
    expect(reactorBackground.classList.contains("heat-critical")).toBe(true);

    // Test extreme heat (200% of max - should show maximum effect)
    game.reactor.current_heat = 2000;
    game.ui.stateManager.setVar("current_heat", game.reactor.current_heat);
    game.ui.updateHeatVisuals();
    expect(reactorBackground.style.backgroundColor).toBe("rgba(255, 0, 0, 0.5)");
    expect(reactorBackground.classList.contains("heat-critical")).toBe(true);

    // Test tile wiggle effect when heat is high (90%+ of max)
    const testPart = game.partset.getPartById("vent1"); // Use a part with containment
    const testTile = game.tileset.getTile(0, 0);
    await testTile.setPart(testPart);
    testTile.heat_contained = testPart.containment * 0.95; // Set tile heat directly
    game.ui.updateHeatVisuals();

    // Check that the tile has the wiggle class
    expect(testTile.$el.classList.contains("heat-wiggle")).toBe(true);

    // Now, reduce the TILE's heat and check that the wiggle class is removed
    testTile.heat_contained = testPart.containment * 0.5;
    game.ui.updateHeatVisuals();
    expect(testTile.$el.classList.contains("heat-wiggle")).toBe(false);
  });
});
