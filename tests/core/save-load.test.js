import { describe, it, expect, beforeEach, vi, afterEach, setupGameWithDOM, setupGame, cleanupGame, Game, UI } from "../helpers/setup.js";
import objective_list_data from "../../public/data/objective_list.json";
import { getObjectiveCheck } from "../../public/src/core/objectiveActions.js";

// Helper to set up the game state for each objective
async function satisfyObjective(game, idx) {
    const obj = objective_list_data[idx];
    const checkFn = getObjectiveCheck(obj.checkId);

    switch (idx) {
        case 0: // Place your first component in the reactor
            await game.tileset
                .getTile(0, 0)
                .setPart(game.partset.getPartById("uranium1"));
            // Run a tick to activate the cell
            game.engine?.tick?.();
            game.reactor.updateStats();
            // Ensure the tile is in the active tiles list
            game.tileset.updateActiveTiles();
            break;

        case 1: // Sell all your power by clicking "Sell"
            game.sold_power = true;
            break;

        case 3: // Put a Heat Vent next to a Cell
            await game.tileset
                .getTile(0, 0)
                .setPart(game.partset.getPartById("uranium1"));
            await game.tileset
                .getTile(0, 1)
                .setPart(game.partset.getPartById("vent1"));
            // Run a tick to activate the cell
            game.engine?.tick?.();
            game.reactor.updateStats();
            // Ensure the tile is in the active tiles list
            game.tileset.updateActiveTiles();
            break;

        default:
            console.warn(`No test implementation for objective ${idx}`);
            break;
    }
}

describe("Save and Load Functionality", () => {
    let game;

    beforeEach(async () => {
        const setup = await setupGameWithDOM();
        game = setup.game;
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

    it("should correctly save the game state to localStorage with cycling slots", async () => {
        const tile = game.tileset.getTile(0, 0);
        const part = game.partset.getPartById("uranium1");
        await tile.setPart(part);

        const upgrade = game.upgradeset.getUpgrade("chronometer");
        game.upgradeset.purchaseUpgrade("chronometer");
        expect(upgrade.level).toBe(1);
        game.current_money = 5000;
        game.exotic_particles = 100;

        // Test cycling through save slots
        game.saveGame(); // Should save to slot 1 (default)
        const currentSlot = parseInt(localStorage.getItem("reactorCurrentSaveSlot") || "1");
        expect(currentSlot).toBe(1);

        // Save again - should cycle to slot 2
        game.saveGame();
        const nextSlot = parseInt(localStorage.getItem("reactorCurrentSaveSlot") || "1");
        expect(nextSlot).toBe(2);

        // Save again - should cycle to slot 3
        game.saveGame();
        const thirdSlot = parseInt(localStorage.getItem("reactorCurrentSaveSlot") || "1");
        expect(thirdSlot).toBe(3);

        // Save again - should cycle back to slot 1
        game.saveGame();
        const backToFirst = parseInt(localStorage.getItem("reactorCurrentSaveSlot") || "1");
        expect(backToFirst).toBe(1);

        // Verify the saved data exists in the current slot
        const savedDataJSON = localStorage.getItem(`reactorGameSave_${backToFirst}`);
        expect(savedDataJSON).not.toBeNull();
        const savedData = JSON.parse(savedDataJSON);
        // Verify the saved data
        expect(savedData.version).toBe(game.version);
        expect(savedData.current_money).toBe(5000);
        expect(savedData.exotic_particles).toBe(100);
        expect(savedData.tiles.length).toBe(1);
        expect(savedData.tiles[0].partId).toBe("uranium1");
        expect(savedData.upgrades.some(u => u.id === "chronometer" && u.level === 1)).toBe(true);
        // New: placedCounts persisted and reflects cumulative placements
        expect(savedData.placedCounts).toBeTypeOf('object');
        expect(savedData.placedCounts['uranium:1']).toBeGreaterThanOrEqual(1);
    });

    it("should provide save slot information", async () => {
        // Set up game state
        game.current_money = 10000;
        game.exotic_particles = 250;
        game.total_played_time = 3600000; // 1 hour

        // Save to slot 1
        game.saveGame(1);

        // Test getSaveSlotInfo
        const slotInfo = game.getSaveSlotInfo(1);
        expect(slotInfo.exists).toBe(true);
        expect(slotInfo.currentMoney).toBe(10000);
        expect(slotInfo.exoticParticles).toBe(250);
        expect(slotInfo.totalPlayedTime).toBe(3600000);
        expect(slotInfo.lastSaveTime).toBeGreaterThan(0);

        // Test getSaveSlotInfo for empty slot
        const emptySlotInfo = game.getSaveSlotInfo(2);
        expect(emptySlotInfo.exists).toBe(false);

        // Test getAllSaveSlots
        const allSlots = game.getAllSaveSlots();
        expect(allSlots).toHaveLength(3);
        expect(allSlots[0].slot).toBe(1);
        expect(allSlots[0].exists).toBe(true);
        expect(allSlots[1].slot).toBe(2);
        expect(allSlots[1].exists).toBe(false);
        expect(allSlots[2].slot).toBe(3);
        expect(allSlots[2].exists).toBe(false);
    });

    it("should correctly load a saved game state", async () => {
        // Create a mock save data object
        const mockSaveData = {
            version: "1.4.0",
            current_money: 12345,
            exotic_particles: 50,
            rows: 14,
            cols: 14,
            tiles: [
                { row: 1, col: 1, partId: "vent2", ticks: 100, heat_contained: 50 }
            ],
            upgrades: [
                { id: "expand_reactor_rows", level: 2 },
                { id: "expand_reactor_cols", level: 2 }
            ],
            reactor: {
                current_heat: 500,
                current_power: 200,
                has_melted_down: false
            },
            placedCounts: { 'vent:2': 3 }
        };
        // Create a new game instance to load into
        const newGame = await setupGame();
        // Test loading from specific slot (set after setupGame to avoid localStorage.clear())
        localStorage.setItem("reactorGameSave_1", JSON.stringify(mockSaveData));
        newGame.engine.stop(); // Stop engine to prevent heat changes during load verification
        const loaded = await newGame.loadGame(1);
        await new Promise(resolve => setTimeout(resolve, 100));

        // Verify the loaded game state
        expect(loaded).toBe(true);
        expect(newGame.current_money).toBe(12345);
        expect(newGame.exotic_particles).toBe(50);
        expect(newGame.rows).toBe(14);
        expect(newGame.cols).toBe(14);
        expect(newGame.tileset.getTile(1, 1).part.id).toBe("vent2");
        
        // Allow for slight variation if a tick slipped through, but heat shouldn't drop by ~40%
        // 28.25 is likely due to venting. 
        // If engine is stopped, it should be exact.
        expect(newGame.tileset.getTile(1, 1).heat_contained).toBe(50);
        
        expect(newGame.upgradeset.getUpgrade("expand_reactor_rows").level).toBe(2);
        expect(newGame.reactor.current_heat).toBe(500);
        // New: placedCounts should be restored from save
        expect(newGame.getPlacedCount('vent', 2)).toBe(3);
    });

    it("should backfill placedCounts from tiles when missing in save data", async () => {
        const mockSaveData = {
            version: "1.4.0",
            current_money: 100,
            rows: 12,
            cols: 12,
            tiles: [
                { row: 0, col: 0, partId: "uranium1", ticks: 10, heat_contained: 0 },
                { row: 0, col: 1, partId: "uranium1", ticks: 10, heat_contained: 0 },
                { row: 0, col: 2, partId: "vent1", ticks: 10, heat_contained: 0 }
            ],
            upgrades: [],
            reactor: { current_heat: 0, current_power: 0, has_melted_down: false }
            // placedCounts intentionally omitted
        };
        const newGame = await setupGame();
        // Set save data after setupGame to avoid localStorage.clear()
        localStorage.setItem("reactorGameSave", JSON.stringify(mockSaveData));
        const loaded = await newGame.loadGame();
        expect(loaded).toBe(true);
        // Backfilled counts from tiles
        expect(newGame.getPlacedCount('uranium', 1)).toBe(2);
        expect(newGame.getPlacedCount('vent', 1)).toBe(1);
    });

    it("should not save the game if a meltdown has occurred", async () => {
        // Induce a real meltdown
        game.reactor.current_heat = game.reactor.max_heat * 2 + 1;
        game.engine.manualTick();
        expect(game.reactor.has_melted_down).toBe(true);

        game.saveGame();
        expect(localStorage.getItem("reactorGameSave")).toBeNull();
    });

    it("should handle loading a save file with missing properties gracefully", async () => {
        const incompleteSave = {
            version: "1.4.0",
            current_money: 500,
            // Missing many properties
        };
        const newGame = await setupGame();
        // Set save data after setupGame to avoid localStorage.clear()
        localStorage.setItem("reactorGameSave", JSON.stringify(incompleteSave));
        const loaded = await newGame.loadGame();
        expect(loaded).toBe(true);

        // Check that defaults are used for missing properties
        expect(newGame.current_money).toBe(500);
        expect(newGame.exotic_particles).toBe(0); // Should be default
        expect(newGame.rows).toBe(newGame.base_rows); // Should be default
    });

    it("should preserve the total played time across save/load cycles", async () => {
        let currentTime = Date.now();
        vi.spyOn(Date, 'now').mockImplementation(() => currentTime);

        game.total_played_time = 3600000; // 1 hour
        game.startSession();

        currentTime += 60000; // Advance time by 1 minute

        game.saveGame();

        // Get the current slot and retrieve saved data from that slot
        const currentSlot = parseInt(localStorage.getItem("reactorCurrentSaveSlot") || "1");
        const savedData = JSON.parse(localStorage.getItem(`reactorGameSave_${currentSlot}`));

        // total_played_time should be updated to include the last session
        expect(savedData.total_played_time).toBe(3600000 + 60000);

        // Load into a new game instance
        const newGame = await setupGame();
        await newGame.applySaveState(savedData);

        expect(newGame.total_played_time).toBe(3660000);
    });

    it("should correctly serialize and deserialize the entire reactor grid", async () => {
        // Create a complex layout
        for (let r = 0; r < game.rows; r++) {
            for (let c = 0; c < game.cols; c++) {
                if ((r + c) % 2 === 0) {
                    await game.tileset.getTile(r, c).setPart(game.partset.getPartById("capacitor1"));
                } else {
                    await game.tileset.getTile(r, c).setPart(game.partset.getPartById("vent1"));
                }
            }
        }

        game.saveGame();

        // Get the current slot and retrieve saved data from that slot
        const currentSlot = parseInt(localStorage.getItem("reactorCurrentSaveSlot") || "1");
        const saveKey = `reactorGameSave_${currentSlot}`;
        const savedDataJSON = localStorage.getItem(saveKey);
        const savedData = JSON.parse(savedDataJSON);
        
        console.log("[DEBUG] Saved tiles count:", savedData.tiles?.length, "rows:", savedData.rows, "cols:", savedData.cols);
        console.log("[DEBUG] Saved tile (0,0):", savedData.tiles?.find(t => t.row === 0 && t.col === 0));

        // Load from the specific slot that was saved
        const newGameSetup = await setupGameWithDOM();
        const newGame = newGameSetup.game;
        
        // CRITICAL FIX: Inject the save data into the NEW JSDOM instance's localStorage
        // because setupGameWithDOM creates a completely isolated environment
        // Access the new window's localStorage directly via global.window which was set by setupGameWithDOM
        window.localStorage.setItem(saveKey, savedDataJSON);

        await newGame.loadGame(currentSlot);
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Force update part caches to ensure parts are loaded
        newGame.engine.markPartCacheAsDirty();
        newGame.engine._updatePartCaches();
        const loadedTileSample = newGame.tileset.getTile(0, 0);
        console.log("[DEBUG] Loaded tile exists:", !!loadedTileSample, "rows:", newGame.rows, "cols:", newGame.cols);
        console.log("[DEBUG] Loaded tile (0,0) part:", loadedTileSample?.part);

        // Verify the entire grid matches
        for (let r = 0; r < Math.min(game.rows, newGame.rows); r++) {
            for (let c = 0; c < Math.min(game.cols, newGame.cols); c++) {
                const originalTile = game.tileset.getTile(r, c);
                const loadedTile = newGame.tileset.getTile(r, c);
                if (originalTile.part) {
                    expect(loadedTile.part, `Tile at (${r}, ${c}) should have part ${originalTile.part.id}`).not.toBeNull();
                    expect(loadedTile.part.id).toBe(originalTile.part.id);
                } else {
                    expect(loadedTile.part).toBeNull();
                }
            }
        }
    });

    it("should reset objectives and default values when starting a new game after saving and completing the first objective", async () => {
        global.window = {};
        global.performance = {
            now: () => Date.now(),
            mark: () => { },
            measure: () => { }
        };
        // 1. Start a new game and complete the first objective
        const game1 = await setupGame();
        // Place a cell to complete the first objective
        const cellPart = game1.partset.getPartById("uranium1");
        await game1.tileset.getTile(0, 0).setPart(cellPart);
        // Let the objective manager process the completion
        game1.objectives_manager.checkAndAutoComplete();
        // Save the game
        game1.saveGame();
        // 2. Start a new game instance (simulate 'New Game')
        const game2 = await setupGame();
        await game2.set_defaults();
        // Re-create the ObjectiveManager to ensure a fresh state (like in app.js)
        const { ObjectiveManager } = await import("../../public/src/core/objective.js");
        game2.objectives_manager = new ObjectiveManager(game2);
        await game2.objectives_manager.initialize();
        game2.objectives_manager.start();
        // 3. Validate that the new game has default values and objectives are reset
        expect(game2.current_money).toBe(game2.base_money);
        expect(game2.objectives_manager.current_objective_index).toBe(0);
        expect(game2.objectives_manager.objectives_data[0].completed).not.toBe(true);
        // The first objective should not be completed in the new game

        // Clean up game instances to prevent memory leaks
        cleanupGame();
    });

    it("New Game should clear saved objectives and upgrades even if a save exists", async () => {
        // 1) Create a game, buy an upgrade, advance objective, and save
        const game1 = await setupGame();
        const upg = game1.upgradeset.getAllUpgrades().find(u => !u.base_ecost);
        if (upg) {
            // Ensure we can purchase
            game1.current_money = 1e9;
            game1.upgradeset.check_affordability(game1);
            game1.upgradeset.purchaseUpgrade(upg.id);
        }
        game1.objectives_manager.current_objective_index = 3;
        game1.saveGame();

        // 2) Simulate clicking New Game: call set_defaults on a fresh game instance
        const game2 = await setupGame();
        await game2.set_defaults();

        // 3) Validate objectives and upgrades are reset
        expect(game2.objectives_manager.current_objective_index).toBe(0);
        const anyPurchased = game2.upgradeset.getAllUpgrades().some(u => u.level > 0);
        expect(anyPurchased).toBe(false);

        cleanupGame();
    });

    it("should not re-reward completed objectives when loading a saved game", async () => {
        // Setup initial game with completed objectives
        const game1 = await setupGame();
        game1.objectives_manager.objectives_data[0].completed = true;
        game1.objectives_manager.objectives_data[1].completed = true;
        game1.objectives_manager.current_objective_index = 2;
        game1.current_money = 500;
        game1.exotic_particles = 10;

        const saveData = game1.getSaveState();
        const moneyBeforeLoad = saveData.current_money;

        // Load into a new game instance
        const game2 = await setupGame();
        await game2.applySaveState(saveData);

        // Verify money has not changed (no rewards were re-applied)
        expect(game2.current_money).toBe(moneyBeforeLoad);
        expect(game2.objectives_manager.objectives_data[0].completed).toBe(true);
        expect(game2.objectives_manager.objectives_data[1].completed).toBe(true);
        expect(game2.objectives_manager.current_objective_index).toBe(2);

        // Clean up game instances to prevent memory leaks
        cleanupGame();
    });
});

describe("index.html", () => {
    it("should contain the google-site-verification meta tag", () => {
        const fs = require("fs");
        const path = require("path");
        const html = fs.readFileSync(path.join(__dirname, "../../public/index.html"), "utf8");
        expect(html).toMatch(/<meta[^>]+name=["']google-site-verification["'][^>]+>/);
    });
}); 