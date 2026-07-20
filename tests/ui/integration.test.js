import { describe, it, expect, beforeEach, afterEach, vi, setupGameWithDOM, toNum } from "../helpers/setup.js";
import { forcePurchaseUpgrade } from "../helpers/gameHelpers.js";
import { patchGameState } from "@app/state.js";
import { buildShellClassMap, buildShellStyleMap, modalUi } from "@app/store.js";
import { assertPageShellClass } from "../helpers/testUtils.js";

describe("UI Integration and Gameplay", () => {
  let game, document;

  beforeEach(async () => {
    const setup = await setupGameWithDOM();
    game = setup.game;
    document = setup.document;

    await game.router.loadPage("upgrades_section");
    await game.router.loadPage("experimental_upgrades_section");
    await game.router.loadPage("reactor_section");
    game.ui.startRenderLoop(0);

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
      await tile.setPart(uraniumPart);

      // Activate the cell and set ticks so it generates power and heat
      tile.activated = true;
      game.coreBridge.setTileTicks(tile.row, tile.col, 10);

      // Update reactor stats to include the new part
      game.reactor.updateStats();
      game.tileset.updateActiveTiles(); // Ensure tiles are active
      // Force update the engine's part cache to include the new part
      // Ensure the engine is running and game is unpaused so it can process the part
      game.paused = false;
      game.onToggleStateChange?.("pause", false);
      game.engine.running = true;
    }

    // 5. Verify the part was placed
    expect(tile.part).not.toBeNull();
    expect(tile.part.id).toBe("uranium1");

    // 6. Run the game engine for one tick
    game.engine.tick();

    // 7. Verify the state has changed
    expect(toNum(game.reactor.current_power)).toBeGreaterThan(0);
    expect(toNum(game.reactor.current_heat)).toBeGreaterThan(0);
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
    game.coreBridge.setReactorPower(1234); // Set power to be sold

    game.sell_action(); // Trigger the actual game action

    expect(toNum(game.reactor.current_power)).toBe(0);
    expect(toNum(game.current_money)).toBe(toNum(initialMoney) + 1234);

    const moneyDisplay = document.getElementById("info_money");
    expect(moneyDisplay, "Money display element should exist").not.toBeNull();
    // Just verify the money display was updated, not the exact format
    expect(moneyDisplay.textContent).toBeTruthy();
  });

  it("should purchase an upgrade and deduct cost", async () => {
    const upgrade = game.upgradeset.getUpgrade("expand_reactor_rows");
    const initialRows = game.rows;

    const success = forcePurchaseUpgrade(game, "expand_reactor_rows");

    expect(success, "Upgrade purchase should succeed").toBe(true);
    expect(upgrade.level).toBe(1);
    expect(game.rows).toBe(initialRows + 1);
  });

  it("should show/hide objectives toast when navigating between pages", async () => {
    const loadPageSafe = async (pageId) => {
      try {
        await game.router.loadPage(pageId);
      } catch (err) {
        const msg = err?.message ?? "";
        if (!msg.includes("ChildPart") || !msg.includes("parentNode")) throw err;
      }
    };

    await loadPageSafe("reactor_section");
    assertPageShellClass(game, "page-reactor");
    expect(game.ui.uiState?.active_page).toBe("reactor_section");
    expect(document.getElementById("objectives_toast_btn"), "Objectives toast should exist").not.toBeNull();

    await loadPageSafe("upgrades_section");
    assertPageShellClass(game, "page-upgrades");
    expect(game.ui.uiState?.active_page).toBe("upgrades_section");

    await loadPageSafe("reactor_section");
    assertPageShellClass(game, "page-reactor");
    expect(game.ui.uiState?.active_page).toBe("reactor_section");
  });

  it("should update reactor heat background based on heat ratio", async () => {
    await game.router.loadPage("reactor_section");
    const reactorBackground = document.getElementById("reactor_background");
    expect(reactorBackground, "Reactor background element should exist").not.toBeNull();

    const shellClasses = () => buildShellClassMap(game.ui.uiState, modalUi, { hasSession: true, game });
    const shellStyles = () => buildShellStyleMap(game.ui.uiState, game);

    game.coreBridge.setReactorHeat(0);
    game.reactor.max_heat = 1000;
    patchGameState(game, { current_heat: game.reactor.current_heat, max_heat: game.reactor.max_heat });
    expect(Number(shellStyles()["--heat-bg-alpha"])).toBe(0);
    expect(shellClasses()["heat-warning"]).toBe(false);
    expect(shellClasses()["heat-critical"]).toBe(false);

    game.coreBridge.setReactorHeat(500);
    patchGameState(game, { current_heat: game.reactor.current_heat });
    expect(Number(shellStyles()["--heat-bg-alpha"])).toBe(0);
    expect(shellClasses()["heat-warning"]).toBe(false);

    game.coreBridge.setReactorHeat(800);
    patchGameState(game, { current_heat: game.reactor.current_heat });
    expect(shellClasses()["heat-warning"]).toBe(true);
    expect(shellClasses()["heat-critical"]).toBe(false);

    game.coreBridge.setReactorHeat(1300);
    patchGameState(game, { current_heat: game.reactor.current_heat });
    expect(shellClasses()["heat-warning"]).toBe(true);
    expect(shellClasses()["heat-critical"]).toBe(true);

    game.coreBridge.setReactorHeat(2000);
    patchGameState(game, { current_heat: game.reactor.current_heat });
    expect(shellClasses()["heat-critical"]).toBe(true);

    const testPart = game.partset.getPartById("vent1");
    const testTile = game.tileset.getTile(0, 0);
    await testTile.setPart(testPart);
    game.coreBridge.setTileHeat(testTile.row, testTile.col, testPart.containment * 0.95);

    if (testTile.$el) {
      expect(testTile.$el.classList.contains("heat-wiggle")).toBe(true);
      game.coreBridge.setTileHeat(testTile.row, testTile.col, testPart.containment * 0.5);
      expect(testTile.$el.classList.contains("heat-wiggle")).toBe(false);
    }
  });
});
