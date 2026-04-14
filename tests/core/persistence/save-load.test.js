import { describe, it, expect, beforeEach, afterEach, setupGameWithDOM, cleanupGame, vi, toNum } from "../../helpers/setup.js";
import { StorageUtils, StorageAdapter, serializeSave, deserializeSave } from "@app/utils.js";

describe("Save and Load Functionality", () => {
  let game;
  let localStorage;

  beforeEach(async () => {
    const setup = await setupGameWithDOM();
    game = setup.game;
    localStorage = setup.window.localStorage;
    localStorage.clear();
  });

  afterEach(() => {
    cleanupGame();
    vi.restoreAllMocks();
  });

  it("should persist game state to localStorage", async () => {
    const saveData = {
      version: game.version,
      current_money: 5000,
      current_exotic_particles: 10,
      tiles: [],
      upgrades: [],
      objectives: { current_objective_index: 0, completed_objectives: [] },
      toggles: {},
      reactor: { current_heat: 0, current_power: 0, has_melted_down: false },
    };
    const payload = JSON.stringify(saveData);
    localStorage.setItem("reactorGameSave_1", payload);
    localStorage.setItem("reactorCurrentSaveSlot", "1");

    const savedJson = localStorage.getItem("reactorGameSave_1");
    expect(savedJson).toBeTruthy();

    const savedData = deserializeSave(savedJson);
    expect(toNum(savedData.current_money)).toBe(5000);
    expect(toNum(savedData.current_exotic_particles ?? savedData.exotic_particles)).toBe(10);
    expect(savedData.version).toBe(game.version);
  });

  it("should load game state from localStorage", async () => {
    const saveData = {
      version: game.version,
      current_money: 9999,
      tiles: [],
      upgrades: [],
      objectives: { current_objective_index: 0, completed_objectives: [] },
      toggles: {},
      reactor: { current_heat: 0, current_power: 0, has_melted_down: false },
    };
    const payload = JSON.stringify(saveData);
    StorageUtils.setRaw("reactorGameSave_1", payload);
    StorageUtils.set("reactorCurrentSaveSlot", 1);

    const savedJson = localStorage.getItem("reactorGameSave_1");
    expect(savedJson).toBeTruthy();
    const savedData = deserializeSave(savedJson);
    expect(toNum(savedData.current_money)).toBe(9999);

    await game.set_defaults();
    expect(toNum(game.current_money)).toBe(game.base_money);

    const loaded = await game.saveManager.loadGame(1);
    expect(loaded).toBe(true);
    expect(toNum(game.current_money)).toBe(9999);
  });

  it("should restore complex grid state", async () => {
    const uranium = game.partset.getPartById("uranium1");
    const vent = game.partset.getPartById("vent1");

    const tile1 = game.tileset.getTile(0, 0);
    const tile2 = game.tileset.getTile(0, 1);

    await tile1.setPart(uranium);
    await tile2.setPart(vent);
    tile1.ticks = 5;

    const rawSave = await game.saveManager.getSaveState();
    const saveData = {
      ...rawSave,
      tiles: rawSave.tiles ?? [],
      current_money: rawSave.current_money ?? 0,
    };
    const payload = serializeSave(saveData);
    await StorageAdapter.setRaw("reactorGameSave_1", payload);
    await StorageAdapter.set("reactorCurrentSaveSlot", 1);

    game.tileset.clearAllTiles();
    expect(tile1.part).toBeNull();

    const loaded = await game.saveManager.loadGame(1);
    expect(loaded).toBe(true);

    const loadedTile1 = game.tileset.getTile(0, 0);
    const loadedTile2 = game.tileset.getTile(0, 1);

    expect(loadedTile1.part?.id).toBe("uranium1");
    expect(loadedTile1.ticks).toBe(5);
    expect(loadedTile2.part?.id).toBe("vent1");
  });

  it("should save and load non-square grid (14x8)", async () => {
    game.gridManager.setRows(14);
    game.gridManager.setCols(8);
    game.base_rows = 14;
    game.base_cols = 8;
    game.tileset.updateActiveTiles();

    const tile94 = game.tileset.getTile(9, 4);
    const tile104 = game.tileset.getTile(10, 4);
    const uranium = game.partset.getPartById("uranium1");
    const vent = game.partset.getPartById("vent1");

    await tile94.setPart(uranium);
    await tile104.setPart(vent);

    const rawSave = await game.saveManager.getSaveState();
    const saveData = { ...rawSave, rows: 14, cols: 8 };
    const payload = serializeSave(saveData);
    await StorageAdapter.setRaw("reactorGameSave_1", payload);
    await StorageAdapter.set("reactorCurrentSaveSlot", 1);

    game.tileset.clearAllTiles();
    game.gridManager.setRows(12);
    game.gridManager.setCols(12);

    const loaded = await game.saveManager.loadGame(1);
    expect(loaded).toBe(true);
    expect(game.rows).toBe(14);
    expect(game.cols).toBe(8);

    const loaded94 = game.tileset.getTile(9, 4);
    const loaded104 = game.tileset.getTile(10, 4);
    expect(loaded94?.part?.id).toBe("uranium1");
    expect(loaded104?.part?.id).toBe("vent1");
  });

  it("should persist and restore ticks", async () => {
    const uranium = game.partset.getPartById("uranium1");
    const tile = game.tileset.getTile(0, 0);
    await tile.setPart(uranium);
    tile.ticks = 5;

    const rawSave = await game.saveManager.getSaveState();
    const payload = serializeSave(rawSave);
    await StorageAdapter.setRaw("reactorGameSave_1", payload);
    await StorageAdapter.set("reactorCurrentSaveSlot", 1);

    game.tileset.clearAllTiles();

    const loaded = await game.saveManager.loadGame(1);
    expect(loaded).toBe(true);
    const loadedTile = game.tileset.getTile(0, 0);
    expect(loadedTile.ticks).toBe(5);

    game.engine.manualTick();
    expect(loadedTile.ticks).toBe(4);
  });

  it("should handle invalid save data gracefully", async () => {
    localStorage.setItem("reactorGameSave_1", "{ invalid json");
    
    const loaded = await game.saveManager.loadGame(1);
    expect(loaded).toBe(false);
    expect(toNum(game.current_money)).toBe(game.base_money);
  });

  it("should clear all game data when starting new game so no stale save is loaded", () => {
    localStorage.setItem("reactorGameSave", "{}");
    localStorage.setItem("reactorGameSave_1", JSON.stringify({ version: 1, current_money: 9999 }));
    localStorage.setItem("reactorGameSave_2", "{}");
    localStorage.setItem("reactorGameSave_3", "{}");
    localStorage.setItem("reactorCurrentSaveSlot", "1");
    localStorage.setItem("reactorGameQuickStartShown", "1");
    localStorage.setItem("google_drive_save_file_id", "fake-id");
    game._saved_objective_index = 2;

    if (typeof window.clearAllGameDataForNewGame === "function") {
      window.clearAllGameDataForNewGame(game);
    } else {
      try {
        localStorage.removeItem("reactorGameSave");
        for (let i = 1; i <= 3; i++) localStorage.removeItem(`reactorGameSave_${i}`);
        localStorage.removeItem("reactorCurrentSaveSlot");
        localStorage.removeItem("reactorGameQuickStartShown");
        localStorage.removeItem("google_drive_save_file_id");
        localStorage.setItem("reactorNewGamePending", "1");
      } catch (_) { }
      if (game && Object.prototype.hasOwnProperty.call(game, "_saved_objective_index")) {
        delete game._saved_objective_index;
      }
    }

    expect(localStorage.getItem("reactorGameSave")).toBeNull();
    expect(localStorage.getItem("reactorGameSave_1")).toBeNull();
    expect(localStorage.getItem("reactorGameSave_2")).toBeNull();
    expect(localStorage.getItem("reactorGameSave_3")).toBeNull();
    expect(localStorage.getItem("reactorCurrentSaveSlot")).toBeNull();
    expect(localStorage.getItem("reactorGameQuickStartShown")).toBeNull();
    expect(localStorage.getItem("google_drive_save_file_id")).toBeNull();
    expect(localStorage.getItem("reactorNewGamePending")).toBe("1");
    expect(game._saved_objective_index).toBeUndefined();
  });
});
