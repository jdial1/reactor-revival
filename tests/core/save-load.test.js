import { describe, it, expect, beforeEach, afterEach, setupGameWithDOM, cleanupGame, vi } from "../helpers/setup.js";

describe("Save and Load Functionality", () => {
  let game;
  let localStorage;

  beforeEach(async () => {
    const setup = await setupGameWithDOM();
    game = setup.game;
    localStorage = setup.window.localStorage;
    localStorage.clear();
    // Restore explicit mock in beforeEach as per original file
    game.googleDriveSave = {
      saveToCloud: vi.fn(() => Promise.resolve()),
      loadFromCloud: vi.fn(() => Promise.resolve({})),
      isSignedIn: vi.fn(() => false)
    };
  });

  afterEach(() => {
    cleanupGame();
    vi.restoreAllMocks();
  });

  it("should persist game state to localStorage", () => {
    game.current_money = 5000;
    game.exotic_particles = 10;
    
    game.saveGame(1);
    
    const savedJson = localStorage.getItem("reactorGameSave_1");
    expect(savedJson).toBeTruthy();
    
    const savedData = JSON.parse(savedJson);
    expect(savedData.current_money).toBe(5000);
    expect(savedData.exotic_particles).toBe(10);
    expect(savedData.version).toBe(game.version);
  });

  it("should load game state from localStorage", async () => {
    game.current_money = 9999;
    game.saveGame(1);
    
    await game.set_defaults();
    expect(game.current_money).toBe(game.base_money);
    
    const loaded = await game.loadGame(1);
    expect(loaded).toBe(true);
    expect(game.current_money).toBe(9999);
  });

  it("should restore complex grid state", async () => {
    const uranium = game.partset.getPartById("uranium1");
    const vent = game.partset.getPartById("vent1");
    
    const tile1 = game.tileset.getTile(0, 0);
    const tile2 = game.tileset.getTile(0, 1);
    
    await tile1.setPart(uranium);
    await tile2.setPart(vent);
    tile1.ticks = 5;
    
    game.saveGame(1);
    
    game.tileset.clearAllTiles();
    expect(tile1.part).toBeNull();
    
    await game.loadGame(1);
    
    const loadedTile1 = game.tileset.getTile(0, 0);
    const loadedTile2 = game.tileset.getTile(0, 1);
    
    expect(loadedTile1.part.id).toBe("uranium1");
    expect(loadedTile1.ticks).toBe(5);
    expect(loadedTile2.part.id).toBe("vent1");
  });

  it("should handle invalid save data gracefully", async () => {
    localStorage.setItem("reactorGameSave_1", "{ invalid json");
    
    const loaded = await game.loadGame(1);
    expect(loaded).toBe(false);
    expect(game.current_money).toBe(game.base_money);
  });
});
