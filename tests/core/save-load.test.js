import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { setupGame, cleanupGame } from "../helpers/setup.js";
import { Game } from "../../js/game.js";
import { UI } from "../../js/ui.js";

describe("Save and Load Functionality", () => {
    let game;

    beforeEach(async () => {
        game = await setupGame();
        // Mock localStorage for a clean testing environment
        const mockStorage = {};
        global.localStorage = {
            setItem: (key, value) => { mockStorage[key] = value; },
            getItem: (key) => mockStorage[key] || null,
            removeItem: (key) => { delete mockStorage[key]; },
            clear: () => { for (const key in mockStorage) { delete mockStorage[key]; } }
        };

        // Mock Google Drive functionality
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

    it("should correctly save the game state to localStorage", async () => {
        // Modify the game state
        await game.tileset.getTile(0, 0).setPart(game.partset.getPartById("uranium1"));
        game.reactor.updateStats();
        // Purchase an upgrade and ensure it's properly applied
        const upgrade = game.upgradeset.getUpgrade("chronometer");
        game.current_money = upgrade.getCost(); // Ensure we have enough money
        game.upgradeset.check_affordability(game);
        const purchased = game.upgradeset.purchaseUpgrade("chronometer");
        expect(purchased).toBe(true);
        expect(upgrade.level).toBe(1);
        // Set money and exotic_particles to test values right before saving
        game.current_money = 5000;
        game.exotic_particles = 100;
        // Save the game
        game.saveGame();
        // Retrieve the saved data from our mock storage
        const savedDataJSON = localStorage.getItem("reactorGameSave");
        expect(savedDataJSON).not.toBeNull();
        const savedData = JSON.parse(savedDataJSON);
        // Verify the saved data
        expect(savedData.version).toBe(game.version);
        expect(savedData.current_money).toBe(5000);
        expect(savedData.exotic_particles).toBe(100);
        expect(savedData.tiles.length).toBe(1);
        expect(savedData.tiles[0].partId).toBe("uranium1");
        expect(savedData.upgrades.some(u => u.id === "chronometer" && u.level === 1)).toBe(true);
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
            }
        };
        localStorage.setItem("reactorGameSave", JSON.stringify(mockSaveData));

        // Create a new game instance to load into
        const newGame = await setupGame();
        const loaded = newGame.loadGame();

        // Verify the loaded game state
        expect(loaded).toBe(true);
        expect(newGame.current_money).toBe(12345);
        expect(newGame.exotic_particles).toBe(50);
        expect(newGame.rows).toBe(14);
        expect(newGame.cols).toBe(14);
        expect(newGame.tileset.getTile(1, 1).part.id).toBe("vent2");
        expect(newGame.tileset.getTile(1, 1).heat_contained).toBe(50);
        expect(newGame.upgradeset.getUpgrade("expand_reactor_rows").level).toBe(2);
        expect(newGame.reactor.current_heat).toBe(500);
    });

    it("should not save the game if a meltdown has occurred", async () => {
        game.reactor.has_melted_down = true;
        game.saveGame();

        expect(localStorage.getItem("reactorGameSave")).toBeNull();
    });

    it("should handle loading a save file with missing properties gracefully", async () => {
        const incompleteSave = {
            version: "1.4.0",
            current_money: 500,
            // Missing many properties
        };
        localStorage.setItem("reactorGameSave", JSON.stringify(incompleteSave));

        const newGame = await setupGame();
        newGame.loadGame();

        // Check that defaults are used for missing properties
        expect(newGame.current_money).toBe(500);
        expect(newGame.exotic_particles).toBe(0); // Should be default
        expect(newGame.rows).toBe(newGame.base_rows); // Should be default
    });

    it("should preserve the total played time across save/load cycles", () => {
        let currentTime = Date.now();
        vi.spyOn(Date, 'now').mockImplementation(() => currentTime);

        game.total_played_time = 3600000; // 1 hour
        game.startSession();

        currentTime += 60000; // Advance time by 1 minute

        game.saveGame();

        const savedData = JSON.parse(localStorage.getItem("reactorGameSave"));

        // total_played_time should be updated to include the last session
        expect(savedData.total_played_time).toBe(3600000 + 60000);

        // Load into a new game instance
        const newGame = new Game(new UI());
        newGame.applySaveState(savedData);

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
        const savedData = JSON.parse(localStorage.getItem("reactorGameSave"));

        const newGame = await setupGame();
        newGame.loadGame();

        // Verify the entire grid matches
        for (let r = 0; r < newGame.rows; r++) {
            for (let c = 0; c < newGame.cols; c++) {
                const originalTile = game.tileset.getTile(r, c);
                const loadedTile = newGame.tileset.getTile(r, c);
                expect(loadedTile.part?.id).toBe(originalTile.part?.id);
            }
        }
    });

    it("should reset objectives and default values when starting a new game after saving and completing the first objective", async () => {
        global.window = {};
        global.performance = { now: () => Date.now() };
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
        game2.set_defaults();
        game2.objectives_manager = new (require("../../js/objective.js").ObjectiveManager)(game2);
        // 3. Validate that the new game has default values and objectives are reset
        expect(game2.current_money).toBe(game2.base_money);
        expect(game2.objectives_manager.current_objective_index).toBe(0);
        expect(game2.objectives_manager.objectives_data[0].completed).not.toBe(true);
        // The first objective should not be completed in the new game
    });
});

describe("index.html", () => {
    it("should contain the google-site-verification meta tag", () => {
        const fs = require("fs");
        const path = require("path");
        const html = fs.readFileSync(path.join(__dirname, "../../index.html"), "utf8");
        expect(html).toMatch(/<meta[^>]+name=["']google-site-verification["'][^>]+>/);
    });
}); 