import { describe, it, expect, beforeEach, vi } from "vitest";
import { Game } from "../../js/game.js";
import { UI } from "../../js/ui.js";
import { setupGame } from "../helpers/setup.js";

describe("Core Game Mechanics", () => {
  let game;

  beforeEach(async () => {
    game = await setupGame();
  });

  it("should enter meltdown when heat exceeds 2x max_heat", async () => {
    expect(game.reactor.has_melted_down).toBe(false);
    game.reactor.current_heat = game.reactor.max_heat * 2 + 1;
    game.engine.tick();
    expect(game.reactor.has_melted_down).toBe(true);
    expect(game.ui.stateManager.getVar("melting_down")).toBe(true);
  });

  it("should reset the game on reboot and add to total exotic particles", async () => {
    await game.tileset
      .getTile(0, 0)
      .setPart(game.partset.getPartById("uranium1"));
    game.exotic_particles = 50;
    game.total_exotic_particles = 10;
    game.current_money = 12345;
    game.reboot_action(true);
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

  it("should set default values correctly on set_defaults()", () => {
    game.current_money = 9999;
    game.rows = 20;
    game.cols = 20;
    game.exotic_particles = 100;
    game.set_defaults();
    expect(game.current_money).toBe(game.base_money);
    expect(game.rows).toBe(game.base_rows);
    expect(game.cols).toBe(game.base_cols);
    expect(game.exotic_particles).toBe(0);
    expect(game.reactor.current_heat).toBe(0);
    expect(game.reactor.current_power).toBe(0);
  });

  it("should toggle pause state and engine", () => {
    const stopSpy = vi.spyOn(game.engine, "stop");
    const startSpy = vi.spyOn(game.engine, "start");

    game.ui.stateManager.setVar("pause", true);
    expect(game.paused).toBe(true);
    expect(stopSpy).toHaveBeenCalled();

    game.ui.stateManager.setVar("pause", false);
    expect(game.paused).toBe(false);
    expect(startSpy).toHaveBeenCalled();
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
      game.total_exotic_particles = 10;
      game.current_money = 12345;
    });

    it("should reset the game on reboot but retain and add to total exotic particles", () => {
      game.reboot_action(true);
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

  it("should initialize with correct default values", () => {
    expect(game.current_money).toBe(game.base_money);
    expect(game.protium_particles).toBe(0);
    expect(game.total_exotic_particles).toBe(0);
    expect(game.exotic_particles).toBe(0);
    expect(game.current_exotic_particles).toBe(0);
    expect(game.rows).toBe(game.base_rows);
    expect(game.cols).toBe(game.base_cols);
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

  it("should save and load total played time", () => {
    // Set some played time
    game.total_played_time = 15000;
    game.session_start_time = Date.now();

    // Get save state
    const saveData = game.getSaveState();
    expect(saveData.total_played_time).toBe(15000);
    expect(saveData.last_save_time).toBeDefined();

    // Create new game and apply save state
    const newGame = Object.create(Object.getPrototypeOf(game));
    Object.assign(newGame, game);
    newGame.total_played_time = 0;
    newGame.session_start_time = null;

    newGame.applySaveState(saveData);
    expect(newGame.total_played_time).toBe(15000);
    // Session should not start automatically - needs to be started explicitly
    expect(newGame.session_start_time).toBeNull();
  });
});
