import { describe, it, expect, beforeEach, vi, Game, UI, setupGame, setupGameWithDOM, cleanupGame } from "../helpers/setup.js";

describe("Core Game Mechanics", () => {
  let game;

  beforeEach(async () => {
    const setup = await setupGameWithDOM();
    game = setup.game;
  });

  it("should enter meltdown from excessive heat generation", async () => {
    expect(game.reactor.has_melted_down).toBe(false);

    // Create a high-heat layout
    const highHeatPart = game.partset.getPartById("nefastium3");
    for (let i = 0; i < 5; i++) {
      const tile = game.tileset.getTile(0, i);
      await tile.setPart(highHeatPart);
      tile.activated = true;
    }
    game.reactor.updateStats();

    // Set heat directly to trigger meltdown threshold
    game.reactor.current_heat = game.reactor.max_heat * 2 + 1;
    game.engine.manualTick();

    expect(game.reactor.has_melted_down).toBe(true);
    expect(game.ui.stateManager.getVar("melting_down")).toBe(true);
  });

  it("should reset the game on reboot and add to total exotic particles", async () => {
    await game.tileset
      .getTile(0, 0)
      .setPart(game.partset.getPartById("uranium1"));
    game.exotic_particles = 50;
    game.total_exotic_particles = 60;
    game.current_exotic_particles = 60;
    game.current_money = 12345;
    await game.reboot_action(true);
    expect(game.current_money).toBe(game.base_money);
    expect(game.tileset.getTile(0, 0).part).toBeNull();
    expect(game.exotic_particles).toBe(0);
    expect(game.total_exotic_particles).toBe(60);
    expect(game.current_exotic_particles).toBe(60);
  });

  it("should reset and not keep any exotic particles on full refund reboot", async () => {
    game.exotic_particles = 50;
    game.total_exotic_particles = 10;
    game.reboot_action(false);
    expect(game.exotic_particles).toBe(0);
    expect(game.total_exotic_particles).toBe(0);
    expect(game.current_exotic_particles).toBe(0);
  });

  it("should set default values correctly on set_defaults()", async () => {
    const game = await setupGame();
    game.current_money = 999;
    game.exotic_particles = 999;
    await game.set_defaults();
    expect(game.current_money).toBe(game.base_money);
    expect(game.exotic_particles).toBe(0);
  });

  it("should toggle pause state via game API", () => {
    expect(game.paused).toBe(false);
    game.togglePause();
    expect(game.paused).toBe(true);
  });

  it("should add money correctly", () => {
    const initialMoney = game.current_money;
    game.addMoney(1000);
    expect(game.current_money).toBe(initialMoney + 1000);
    expect(game.ui.stateManager.getVar("current_money")).toBe(
      game.current_money
    );
  });

  describe("Reboot Actions", () => {
    beforeEach(async () => {
      await game.tileset
        .getTile(0, 0)
        .setPart(game.partset.getPartById("uranium1"));
      game.exotic_particles = 50;
      game.total_exotic_particles = 60;
      game.current_exotic_particles = 60;
      game.current_money = 12345;
    });

    it("should reset the game on reboot but retain and add to total exotic particles", async () => {
      await game.reboot_action(true);
      expect(game.current_money).toBe(game.base_money);
      expect(game.tileset.getTile(0, 0).part).toBeNull();
      expect(game.exotic_particles).toBe(0);
      expect(game.total_exotic_particles).toBe(60);
      expect(game.current_exotic_particles).toBe(60);
    });

    it("should reset and not keep current exotic particles if rebooting without keep", () => {
      game.reboot_action(false);
      expect(game.current_money).toBe(game.base_money);
      expect(game.exotic_particles).toBe(0);
      expect(game.total_exotic_particles).toBe(0);
      expect(game.current_exotic_particles).toBe(0);
    });
  });

  it("should initialize with correct default values", async () => {
    // Create a fresh game instance specifically for this test to avoid test setup interference
    const freshGame = await setupGame();
    // Reset to actual defaults by calling set_defaults
    await freshGame.set_defaults();

    expect(freshGame.current_money).toBe(freshGame.base_money);
    expect(freshGame.protium_particles).toBe(0);
    expect(freshGame.total_exotic_particles).toBe(0);
    expect(freshGame.exotic_particles).toBe(0);
    expect(freshGame.current_exotic_particles).toBe(0);
    expect(freshGame.rows).toBe(freshGame.base_rows);
    expect(freshGame.cols).toBe(freshGame.base_cols);
  });

  it("should initialize new game state correctly", () => {
    // Set some non-default values first
    game.current_money = 999;
    game.protium_particles = 50;
    game.total_exotic_particles = 25;

    // Initialize new game state
    game.initialize_new_game_state();

    // Check that values are reset to defaults
    expect(game.current_money).toBe(game.base_money);
    expect(game.protium_particles).toBe(0);
    expect(game.total_exotic_particles).toBe(0);
    expect(game.exotic_particles).toBe(0);
    expect(game.current_exotic_particles).toBe(0);

    // Session should not be started automatically
    expect(game.session_start_time).toBeNull();
  });

  it("should track total played time correctly", () => {
    // Mock Date.now to control time
    const mockNow = vi.spyOn(Date, "now");
    let currentTime = 1000000;
    mockNow.mockImplementation(() => currentTime);

    // Start session
    game.startSession();
    expect(game.session_start_time).toBe(currentTime);
    expect(game.total_played_time).toBe(0);

    // Advance time by 5 seconds
    currentTime += 5000;
    game.updateSessionTime();

    // Should have accumulated 5 seconds
    expect(game.total_played_time).toBe(5000);
    expect(game.session_start_time).toBe(currentTime); // Should be reset

    // Advance time by another 3 seconds
    currentTime += 3000;
    game.updateSessionTime();

    // Should have accumulated 8 seconds total
    expect(game.total_played_time).toBe(8000);

    mockNow.mockRestore();
  });

  it("should format time correctly", () => {
    expect(game.formatTime(0)).toBe('0<span class="time-unit">s</span>');
    expect(game.formatTime(30000)).toBe('30<span class="time-unit">s</span>');
    expect(game.formatTime(90000)).toBe(
      '1<span class="time-unit">m</span> 30<span class="time-unit">s</span>'
    );
    expect(game.formatTime(3661000)).toBe(
      '1<span class="time-unit">h</span> 1<span class="time-unit">m</span> 1<span class="time-unit">s</span>'
    );
    expect(game.formatTime(90061000)).toBe(
      '1<span class="time-unit">d</span> 1<span class="time-unit">h</span> 1<span class="time-unit">m</span> 1<span class="time-unit">s</span>'
    );
  });

  it("should get formatted total played time including current session", () => {
    // Mock Date.now to control time
    const mockNow = vi.spyOn(Date, "now");
    let currentTime = 1000000;
    mockNow.mockImplementation(() => currentTime);

    // Set some existing total time
    game.total_played_time = 10000; // 10 seconds

    // Start session
    game.startSession();
    expect(game.session_start_time).toBe(currentTime);

    // Advance time by 5 seconds
    currentTime += 5000;

    // Should include both total and current session time
    const formattedTime = game.getFormattedTotalPlayedTime();
    expect(formattedTime).toBe('15<span class="time-unit">s</span>'); // 10s + 5s

    mockNow.mockRestore();
  });

  it("should save and load total played time", async () => {
    game.session_start_time = null;
    game.total_played_time = 15000;
    const saveData = game.getSaveState();
    expect(saveData.total_played_time).toBe(15000);
    expect(saveData.last_save_time).toBeDefined();
    const newGame = new Game(new UI());
    await newGame.applySaveState(saveData);
    expect(newGame.total_played_time).toBe(15000);
    // Session should not start automatically - needs to be started explicitly
    expect(newGame.session_start_time).toBeNull();
  });

  it("should save and load objectives state correctly", async () => {
    // Complete a few objectives to advance the index
    game.objectives_manager.current_objective_index = 5;

    // Get save state
    const saveData = game.getSaveState();

    // Verify objective index is saved
    expect(saveData.objectives.current_objective_index).toBe(5);

    // Create a new game instance and apply save state
    const newGame = await setupGame();
    await newGame.applySaveState(saveData);

    // Verify the saved objective index is stored for restoration
    expect(newGame._saved_objective_index).toBe(5);

    // Simulate the startup process where objective manager gets the saved index
    if (newGame._saved_objective_index !== undefined) {
      newGame.objectives_manager.current_objective_index =
        newGame._saved_objective_index;
      delete newGame._saved_objective_index;
    }

    // Verify the objective manager has the correct index
    expect(newGame.objectives_manager.current_objective_index).toBe(5);

    // Clean up the new game instance to prevent memory leaks
    cleanupGame();
  });

  it("should clear all upgrades and reset reactor size during reboot (no preserve)", async () => {
    // Purchase row and column expansion upgrades
    const rowUpgrade = game.upgradeset.getUpgrade("expand_reactor_rows");
    const colUpgrade = game.upgradeset.getUpgrade("expand_reactor_cols");

    // Set enough money to buy upgrades
    game.current_money = 1000000;

    // Purchase upgrades
    game.upgradeset.purchaseUpgrade(rowUpgrade.id);
    game.upgradeset.purchaseUpgrade(rowUpgrade.id);
    game.upgradeset.purchaseUpgrade(colUpgrade.id);

    // Sanity check before reboot
    expect(rowUpgrade.level).toBe(2);
    expect(colUpgrade.level).toBe(1);
    expect(game.rows).toBe(game.base_rows + 2);
    expect(game.cols).toBe(game.base_cols + 1);

    // Perform reboot with refund (clear all research/upgrades)
    await game.reboot_action(false);

    // All upgrades should be cleared and reactor size reset to base
    expect(game.upgradeset.getUpgrade("expand_reactor_rows").level).toBe(0);
    expect(game.upgradeset.getUpgrade("expand_reactor_cols").level).toBe(0);
    expect(game.rows).toBe(game.base_rows);
    expect(game.cols).toBe(game.base_cols);

    // Verify other things are reset properly
    expect(game.current_money).toBe(game.base_money);
    expect(game.reactor.current_heat).toBe(0);
    expect(game.reactor.current_power).toBe(0);
  });

  describe("Failsafe Logic", () => {
    it("should give $10 when player has no money, no power, and no parts to sell", () => {
      game.current_money = 0;
      game.reactor.current_power = 0;
      // Ensure no parts in reactor
      game.tileset.active_tiles_list.forEach((tile) => {
        if (tile.part) tile.clearPart(false);
      });

      const initialMoney = game.current_money;
      game.sell_action();

      expect(game.current_money).toBe(initialMoney + 10);
    });

    it("should NOT give money when player has sellable parts in reactor", async () => {
      game.current_money = 0;
      game.reactor.current_power = 0;

      // Place a part in the reactor
      const tile = game.tileset.getTile(0, 0);
      const part = game.partset.getPartById("uranium1");
      await tile.setPart(part);

      const initialMoney = game.current_money;
      game.sell_action();

      expect(game.current_money).toBe(initialMoney); // No money given when parts can be sold
    });

    it("should NOT automatically give money via reactor updateStats (removed for being too aggressive)", () => {
      game.current_money = 0;
      game.reactor.current_power = 0;
      // Ensure no parts in reactor
      game.tileset.active_tiles_list.forEach((tile) => {
        if (tile.part) tile.clearPart(false);
      });

      const initialMoney = game.current_money;
      game.reactor.updateStats();

      expect(game.current_money).toBe(initialMoney); // No automatic money from reactor updateStats
    });
  });
});
