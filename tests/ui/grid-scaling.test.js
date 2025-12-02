import { describe, it, expect, beforeEach, afterEach, vi, setupGameWithDOM } from "../helpers/setup.js";

import { GridScaler } from "../../public/src/components/gridScaler.js";

describe("Grid Scaling Logic (Reshaping)", () => {
    let game, ui, wrapper, reactor, document, window;

    beforeEach(async () => {
        const setup = await setupGameWithDOM();
        game = setup.game;
        ui = game.ui;
        document = setup.document;
        window = setup.window;

        // Mock the resizeGrid method on the game instance since logic now depends on it
        game.resizeGrid = vi.fn((rows, cols) => {
            game.rows = rows;
            game.cols = cols;
        });

        // Initialize the specific GridScaler we want to test
        ui.gridScaler = new GridScaler(ui);
        
        await game.router.loadPage("reactor_section");
        wrapper = ui.DOMElements.reactor_wrapper;
        reactor = ui.DOMElements.reactor;

        if (!wrapper || !reactor) {
            throw new Error("Reactor elements not found in DOM");
        }

        // Ensure wrapper has the GridScaler initialized
        ui.gridScaler.wrapper = wrapper;
        ui.gridScaler.reactor = reactor;
    });

    const mockDimensions = (w, h) => {
        // Mock getBoundingClientRect
        vi.spyOn(wrapper, 'getBoundingClientRect').mockReturnValue({
            width: w,
            height: h,
            top: 0, left: 0, bottom: h, right: w,
            x: 0, y: 0, toJSON: () => {}
        });

        // Mock clientWidth/Height which the new logic uses
        Object.defineProperty(wrapper, 'clientWidth', { value: w, configurable: true });
        Object.defineProperty(wrapper, 'clientHeight', { value: h, configurable: true });
    };

    it("should calculate correct dimensions for Square Aspect Ratio (1:1)", () => {
        mockDimensions(800, 800);
        
        ui.gridScaler.resize();

        // Target 144 tiles. Sqrt(144) = 12.
        // Expect 12x12
        expect(game.rows).toBe(12);
        expect(game.cols).toBe(12);
        expect(game.resizeGrid).toHaveBeenCalledWith(12, 12);
        
        // Tile size should fit: 800 / 12 = 66.6 -> 66px
        const tileSizeVar = reactor.style.getPropertyValue('--tile-size');
        expect(tileSizeVar).toBe('66px');
    });

    it("should reshape to Portrait (Mobile) Aspect Ratio", () => {
        // 9:16 approx ratio (Mobile phone)
        mockDimensions(400, 800); 
        
        ui.gridScaler.resize();

        // Logic: 
        // Ratio = 0.5
        // Rows = sqrt(144 / 0.5) = sqrt(288) = ~16.97 -> Rounds to 17
        // Cols = 144 / 17 = ~8.47 -> Rounds to 8
        
        expect(game.rows).toBeGreaterThan(game.cols); // Verify portrait shape
        expect(game.rows).toBe(17);
        expect(game.cols).toBe(8);
        
        // Verify total tiles is close to 144 (17 * 8 = 136)
        expect(game.rows * game.cols).toBeGreaterThan(130);
    });

    it("should reshape to Landscape (Desktop) Aspect Ratio", () => {
        // 2:1 approx ratio (Wide monitor)
        mockDimensions(1200, 600);
        
        ui.gridScaler.resize();

        // Logic:
        // Ratio = 2.0
        // Rows = sqrt(144 / 2.0) = sqrt(72) = ~8.48 -> Rounds to 8
        // Cols = 144 / 8 = 18
        
        expect(game.cols).toBeGreaterThan(game.rows); // Verify landscape shape
        expect(game.rows).toBe(8);
        expect(game.cols).toBe(17);

        // Verify total tiles is close to 144 (8 * 18 = 144)
        // 17 * 8 = 136
        expect(game.rows * game.cols).toBe(136);
    });

    it("should apply CSS variables correctly", () => {
        mockDimensions(500, 500);
        ui.gridScaler.resize();

        expect(reactor.style.getPropertyValue('--game-rows')).toBe('12');
        expect(reactor.style.getPropertyValue('--game-cols')).toBe('12');
        
        // 500 / 12 = 41.6 -> 41px
        expect(reactor.style.getPropertyValue('--tile-size')).toBe('41px');
        
        // Container dimensions should match calculation
        expect(reactor.style.width).toBe(`${12 * 41}px`);
        expect(reactor.style.height).toBe(`${12 * 41}px`);
    });

    it("should respect min/max limits configured in GridScaler", () => {
        // Extremely wide screen
        mockDimensions(3000, 100); 
        
        ui.gridScaler.resize();

        // Should check clamps (defined in the class config)
        // Assuming maxCols is 20 based on previous logic request
        expect(game.cols).toBeLessThanOrEqual(20); 
        expect(game.rows).toBeGreaterThanOrEqual(6); // minRows
    });

    it("should center the grid via wrapper styles", () => {
        mockDimensions(800, 600);
        ui.gridScaler.resize();
        
        // The scaler enforces flex centering on the wrapper
        expect(wrapper.style.display).toBe('flex');
        expect(wrapper.style.alignItems).toBe('center'); // Vertical Center
        expect(wrapper.style.justifyContent).toBe('center'); // Horizontal Center
    });
});
