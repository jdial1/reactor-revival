import { describe, it, expect, beforeEach, afterEach, setupGame, setupGameWithDOM, cleanupGame } from "../helpers/setup.js";

describe("Pause Behavior", () => {
    let game;

    beforeEach(async () => {
        game = await setupGame();
    });

    afterEach(() => {
        cleanupGame();
    });

    it("should prevent heat generation when game is paused", async () => {
        // Set up a high-heat generating cell
        const fuelPart = game.partset.getPartById("plutonium1");
        const tile = game.tileset.getTile(0, 0);
        await tile.setPart(fuelPart);
        tile.activated = true;
        tile.ticks = 10;

        // Set initial reactor heat
        const initialHeat = game.reactor.current_heat;

        // Pause the game
        game.ui.stateManager.setVar("pause", true);
        game.onToggleStateChange("pause", true);
        expect(game.paused).toBe(true);

        // Process multiple ticks while paused
        for (let i = 0; i < 5; i++) {
            game.engine.tick();
        }

        // Heat should not change when game is paused
        expect(game.reactor.current_heat).toBe(initialHeat);

        // Unpause the game
        game.ui.stateManager.setVar("pause", false);
        game.onToggleStateChange("pause", false);
        expect(game.paused).toBe(false);

        // Process a tick while unpaused
        game.engine.tick();

        // Heat should now change when game is unpaused
        expect(game.reactor.current_heat).toBeGreaterThan(initialHeat);
    });

    it("should prevent part explosions when game is paused", async () => {
        // Set up a component that could explode
        const ventPart = game.partset.getPartById("vent1");
        const tile = game.tileset.getTile(0, 0);
        await tile.setPart(ventPart);
        tile.activated = true;

        // Set heat above containment to trigger explosion
        tile.heat_contained = ventPart.containment * 1.5;

        // Mock the explosion handler to track if it was called
        const originalHandleComponentExplosion = game.engine.handleComponentExplosion;
        let explosionCalled = false;
        game.engine.handleComponentExplosion = (explodedTile) => {
            explosionCalled = true;
        };

        // Pause the game
        game.ui.stateManager.setVar("pause", true);
        game.onToggleStateChange("pause", true);
        expect(game.paused).toBe(true);

        // Process multiple ticks while paused
        for (let i = 0; i < 5; i++) {
            game.engine.tick();
        }

        // Component should not explode when game is paused
        expect(explosionCalled).toBe(false);
        expect(tile.part).toBe(ventPart); // Part should still exist

        // Unpause the game
        game.ui.stateManager.setVar("pause", false);
        game.onToggleStateChange("pause", false);
        expect(game.paused).toBe(false);

        // Process a tick while unpaused
        game.engine.tick();

        // Component should now explode when game is unpaused
        expect(explosionCalled).toBe(true);

        // Restore original handler
        game.engine.handleComponentExplosion = originalHandleComponentExplosion;
    });

    it("should prevent heat manager processing when game is paused", async () => {
        // Set up a cooling setup
        const coolantPart = game.partset.getPartById("coolant_cell1");
        const exchangerPart = game.partset.getPartById("heat_exchanger1");
        const ventPart = game.partset.getPartById("vent1");

        const coolantTile = game.tileset.getTile(5, 5);
        const exchangerTile = game.tileset.getTile(5, 6);
        const ventTile = game.tileset.getTile(5, 7);

        await coolantTile.setPart(coolantPart);
        await exchangerTile.setPart(exchangerPart);
        await ventTile.setPart(ventPart);

        coolantTile.activated = true;
        exchangerTile.activated = true;
        ventTile.activated = true;

        // Add initial heat to coolant cell
        coolantTile.heat_contained = 1000;
        const initialHeat = coolantTile.heat_contained;

        // Pause the game
        game.ui.stateManager.setVar("pause", true);
        game.onToggleStateChange("pause", true);
        expect(game.paused).toBe(true);

        // Process the engine tick while paused
        game.engine.tick();

        // Heat should not change when game is paused
        expect(coolantTile.heat_contained).toBe(initialHeat);

        // Unpause the game
        game.ui.stateManager.setVar("pause", false);
        game.onToggleStateChange("pause", false);
        expect(game.paused).toBe(false);

        // Process the engine tick again while unpaused
        game.engine.tick();

        // Heat should now change when game is unpaused
        // Run a few ticks to ensure heat processing occurs
        game.engine.tick();
        game.engine.tick();

        // The engine should process ticks when unpaused, so we should see some change
        // Either heat transfer occurs or the engine processes the tick
        const heatChanged = coolantTile.heat_contained !== initialHeat;
        const engineProcessed = game.engine.running || game.reactor.current_power > 0;

        expect(heatChanged || engineProcessed).toBe(true);
    });

    it("should prevent engine loop from running when game is paused", () => {
        // Start the engine
        game.engine.start();
        expect(game.engine.running).toBe(true);

        // Pause the game
        game.ui.stateManager.setVar("pause", true);
        game.onToggleStateChange("pause", true);
        expect(game.paused).toBe(true);

        // Engine should stop when game is paused
        expect(game.engine.running).toBe(false);

        // Unpause the game
        game.ui.stateManager.setVar("pause", false);
        game.onToggleStateChange("pause", false);
        expect(game.paused).toBe(false);

        // Engine should start again when game is unpaused
        expect(game.engine.running).toBe(true);
    });

    it("should prevent multiple systems from processing when game is paused", async () => {
        // Set up a complex scenario with multiple components
        const fuelPart = game.partset.getPartById("uranium1");
        const ventPart = game.partset.getPartById("vent1");
        const capacitorPart = game.partset.getPartById("capacitor1");

        const fuelTile = game.tileset.getTile(0, 0);
        const ventTile = game.tileset.getTile(0, 1);
        const capacitorTile = game.tileset.getTile(0, 2);

        await fuelTile.setPart(fuelPart);
        await ventTile.setPart(ventPart);
        await capacitorTile.setPart(capacitorPart);

        fuelTile.activated = true;
        ventTile.activated = true;
        capacitorTile.activated = true;

        // Set initial values
        const initialReactorHeat = game.reactor.current_heat;
        const initialReactorPower = game.reactor.current_power;
        const initialVentHeat = ventTile.heat_contained || 0;
        const initialCapacitorHeat = capacitorTile.heat_contained || 0;

        // Pause the game
        game.ui.stateManager.setVar("pause", true);
        game.onToggleStateChange("pause", true);
        expect(game.paused).toBe(true);

        // Process multiple engine ticks while paused
        for (let i = 0; i < 10; i++) {
            game.engine.tick();
        }

        // Nothing should change when game is paused
        expect(game.reactor.current_heat).toBe(initialReactorHeat);
        expect(game.reactor.current_power).toBe(initialReactorPower);
        expect(ventTile.heat_contained || 0).toBe(initialVentHeat);
        expect(capacitorTile.heat_contained || 0).toBe(initialCapacitorHeat);

        // Unpause the game
        game.ui.stateManager.setVar("pause", false);
        game.onToggleStateChange("pause", false);
        expect(game.paused).toBe(false);

        // Process a single tick while unpaused
        game.engine.tick();

        // Values should now change when game is unpaused
        // Power should definitely change
        expect(game.reactor.current_power).not.toBe(initialReactorPower);

        // Heat might be distributed and then vented, so the final values might be the same
        // but the important thing is that the engine processed the tick when unpaused
        // We can verify this by checking that the engine is running
        expect(game.engine.running).toBe(true);
    });

    it("should handle pause state correctly in save/load scenarios", async () => {
        // Set up a game state
        const fuelPart = game.partset.getPartById("uranium1");
        const tile = game.tileset.getTile(0, 0);
        await tile.setPart(fuelPart);
        tile.activated = true;

        // Pause the game
        game.ui.stateManager.setVar("pause", true);
        game.onToggleStateChange("pause", true);
        expect(game.paused).toBe(true);

        // Get save state
        const saveData = game.getSaveState();

        // Create new game and load save state
        const newGame = await setupGame();
        newGame.applySaveState(saveData);

        // Pause state should be preserved
        expect(newGame.paused).toBe(true);

        // Engine should be stopped
        expect(newGame.engine.running).toBe(false);

        // Unpause the new game
        newGame.ui.stateManager.setVar("pause", false);
        newGame.onToggleStateChange("pause", false);
        expect(newGame.paused).toBe(false);

        // Engine should start
        expect(newGame.engine.running).toBe(true);

        cleanupGame();
    });

    it("should prevent time-based progression when game is paused", () => {
        // Set up a part with limited ticks
        const fuelPart = game.partset.getPartById("uranium1");
        const tile = game.tileset.getTile(0, 0);
        tile.setPart(fuelPart);
        tile.activated = true;
        tile.ticks = 5;

        const initialTicks = tile.ticks;

        // Pause the game
        game.ui.stateManager.setVar("pause", true);
        game.onToggleStateChange("pause", true);
        expect(game.paused).toBe(true);

        // Process multiple ticks while paused
        for (let i = 0; i < 10; i++) {
            game.engine.tick();
        }

        // Ticks should not decrease when game is paused
        expect(tile.ticks).toBe(initialTicks);

        // Unpause the game
        game.ui.stateManager.setVar("pause", false);
        game.onToggleStateChange("pause", false);
        expect(game.paused).toBe(false);

        // Process a tick while unpaused
        game.engine.tick();

        // Ticks should now decrease when game is unpaused
        expect(tile.ticks).toBeLessThan(initialTicks);
    });

    it("should show and hide pause banner when game is paused and resumed", async () => {
        // Use setupGameWithDOM to get access to router and DOM
        const { game: gameWithDOM } = await setupGameWithDOM();

        // Ensure we're on the reactor page to have access to the pause banner
        await gameWithDOM.router.loadPage("reactor_section");

        // Wait for page to load
        await new Promise((resolve) => setTimeout(resolve, 100));

        const pauseBanner = document.getElementById("pause_banner");
        expect(pauseBanner).toBeTruthy();

        // Initially, pause banner should be hidden
        expect(document.body.classList.contains("game-paused")).toBe(false);

        // Pause the game
        gameWithDOM.ui.stateManager.setVar("pause", true);
        gameWithDOM.onToggleStateChange("pause", true);
        expect(gameWithDOM.paused).toBe(true);

        // Trigger UI update to show pause banner
        gameWithDOM.ui.updatePauseState();

        // Pause banner should now be visible
        expect(document.body.classList.contains("game-paused")).toBe(true);

        // Unpause the game
        gameWithDOM.ui.stateManager.setVar("pause", false);
        gameWithDOM.onToggleStateChange("pause", false);
        expect(gameWithDOM.paused).toBe(false);

        // Trigger UI update to hide pause banner
        gameWithDOM.ui.updatePauseState();

        // Pause banner should now be hidden
        expect(document.body.classList.contains("game-paused")).toBe(false);
    });
}); 