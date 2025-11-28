import { describe, it, expect, beforeEach, afterEach, vi, setupGameWithDOM } from "../helpers/setup.js";

describe("Grid Scaling Logic", () => {
    let game, ui, wrapper, reactor, document, window;

    beforeEach(async () => {
        const setup = await setupGameWithDOM();
        game = setup.game;
        ui = game.ui;
        document = setup.document;
        window = setup.window;
        
        // Ensure window is available globally for timeout callbacks
        // Set on both global and globalThis to ensure it's accessible
        // Also ensure window.innerWidth and innerHeight are set
        if (typeof global !== 'undefined') {
            global.window = window;
            if (global.window && !global.window.innerWidth) {
                global.window.innerWidth = 1280;
                global.window.innerHeight = 800;
            }
        }
        if (typeof globalThis !== 'undefined') {
            globalThis.window = window;
            if (globalThis.window && !globalThis.window.innerWidth) {
                globalThis.window.innerWidth = 1280;
                globalThis.window.innerHeight = 800;
            }
        }
        
        // Ensure we are on the reactor page so resizing logic runs
        await game.router.loadPage("reactor_section");
        
        // Wait for any timeout callbacks to complete
        await new Promise(resolve => setTimeout(resolve, 100));
        
        wrapper = ui.DOMElements.reactor_wrapper;
        reactor = ui.DOMElements.reactor;

        if (!wrapper || !reactor) {
            throw new Error("Reactor elements not found in DOM");
        }
    });

    afterEach(async () => {
        // Wait for any pending timeouts to complete
        await new Promise(resolve => setTimeout(resolve, 200));
    });

    const mockDimensions = (w, h) => {
        // Mock getBoundingClientRect for the wrapper
        vi.spyOn(wrapper, 'getBoundingClientRect').mockReturnValue({
            width: w,
            height: h,
            top: 0, 
            left: 0, 
            bottom: h, 
            right: w,
            x: 0,
            y: 0,
            toJSON: () => {}
        });
        
        // Mock offsetParent to simulate element being visible
        // Use captured document to avoid undefined reference errors
        const doc = document;
        Object.defineProperty(wrapper, 'offsetParent', {
            get: () => doc && doc.body ? doc.body : null,
            configurable: true
        });
        
        // Ensure window is available and has the necessary properties
        // This is needed because GridScaler accesses window.innerWidth/innerHeight
        // Set on the actual window object
        if (window) {
            Object.defineProperty(window, 'innerWidth', {
                writable: true,
                configurable: true,
                value: w
            });
            Object.defineProperty(window, 'innerHeight', {
                writable: true,
                configurable: true,
                value: h
            });
        }
        
        // Also set on global and globalThis to ensure timeout callbacks can access it
        if (typeof global !== 'undefined' && global.window) {
            Object.defineProperty(global.window, 'innerWidth', {
                writable: true,
                configurable: true,
                value: w
            });
            Object.defineProperty(global.window, 'innerHeight', {
                writable: true,
                configurable: true,
                value: h
            });
        }
        if (typeof globalThis !== 'undefined' && globalThis.window) {
            Object.defineProperty(globalThis.window, 'innerWidth', {
                writable: true,
                configurable: true,
                value: w
            });
            Object.defineProperty(globalThis.window, 'innerHeight', {
                writable: true,
                configurable: true,
                value: h
            });
        }
    };

    it("should scale tiles to fit width on portrait/mobile screens", () => {
        game.rows = 10;
        game.cols = 10;
        
        // Scenario: Mobile screen 400px wide, 800px high
        // Padding in GridScaler is 10px on each side -> 20px total
        // Available width = 380px
        // Available height = 780px
        // Tile size calculation = Math.min(380/10, 780/10) = 38
        
        mockDimensions(400, 800);
        ui.gridScaler.resize();

        const tileSizeVar = reactor.style.getPropertyValue('--tile-size');
        expect(tileSizeVar).toBe('38px');
        
        const gridWidth = parseInt(reactor.style.width);
        const gridHeight = parseInt(reactor.style.height);
        
        // Grid should be 380x380
        expect(gridWidth).toBe(380);
        expect(gridHeight).toBe(380);
        
        // Should fit within wrapper
        expect(gridWidth).toBeLessThanOrEqual(400);
        expect(gridHeight).toBeLessThanOrEqual(800);
    });

    it("should scale tiles to fit height on landscape/desktop screens", () => {
        game.rows = 10;
        game.cols = 20;
        
        // Scenario: Landscape screen 1000px wide, 400px high
        // Available width = 980px (1000 - 20 padding)
        // Available height = 380px (400 - 20 padding)
        // Initial calculation: min(980/20, 380/10) = min(49, 38) = 38
        // Then subtract tileSize*2 for padding: 380 - 76 = 304
        // Recalculate: min(980/20, 304/10) = min(49, 30.4) = 30
        // Should pick smaller: 30
        
        mockDimensions(1000, 400);
        ui.gridScaler.resize();

        const tileSizeVar = reactor.style.getPropertyValue('--tile-size');
        expect(tileSizeVar).toBe('30px');
        
        const gridWidth = parseInt(reactor.style.width);
        const gridHeight = parseInt(reactor.style.height);
        
        expect(gridWidth).toBe(30 * 20); // 600
        expect(gridHeight).toBe(30 * 10); // 300
        
        expect(gridWidth).toBeLessThanOrEqual(1000);
        expect(gridHeight).toBeLessThanOrEqual(400);
    });

    it("should respect minimum tile size limit", () => {
        game.rows = 100;
        game.cols = 100;
        
        // Scenario: Tiny container 200x200
        // Available: 180
        // Calculated raw: 1.8
        // GridScaler enforces Math.max(tileSize, 10)
        
        mockDimensions(200, 200);
        ui.gridScaler.resize();
        
        const tileSizeVar = reactor.style.getPropertyValue('--tile-size');
        expect(tileSizeVar).toBe('10px');
    });

    it("should recalculate when grid dimensions change", () => {
        mockDimensions(500, 500);
        // Avail: 480 (500 - 20 padding)
        
        // Initial: 10x10 -> 48px initial, then subtract 96 for padding: 480-96=384, recalc: min(48, 38.4) = 38
        game.rows = 10;
        game.cols = 10;
        ui.gridScaler.resize();
        expect(reactor.style.getPropertyValue('--tile-size')).toBe('38px');

        // Change to 20x20 -> 24px initial, then subtract 48 for padding: 480-48=432, recalc: min(24, 21.6) = 21
        game.rows = 20;
        game.cols = 20;
        ui.gridScaler.resize();
        expect(reactor.style.getPropertyValue('--tile-size')).toBe('21px');
    });

    it("should center the grid content via flexbox properties on wrapper", () => {
        mockDimensions(800, 600);
        ui.gridScaler.resize();
        
        expect(wrapper.style.display).toBe('flex');
        expect(wrapper.style.alignItems).toBe('flex-start');
        expect(wrapper.style.justifyContent).toBe('center');
        expect(wrapper.style.overflow).toBe('hidden');
    });
    
    it("should handle extreme aspect ratios without overflow", () => {
        game.rows = 50;
        game.cols = 5; // Very tall grid
        
        // Screen: 500x500 (Square)
        // Avail: 480x480
        
        // Width const: 480 / 5 = 96
        // Height const: 480 / 50 = 9.6 -> floor(9.6) = 9 -> min(9, 10) = 10 (clamped)
        // Wait, logic is Math.floor(Math.min(...)). 
        // 9.6 floored is 9. 
        // Then Math.max(9, 10) is 10.
        
        mockDimensions(500, 500);
        ui.gridScaler.resize();
        
        // With 10px tiles:
        // Width = 5 * 10 = 50px (Fits in 500)
        // Height = 50 * 10 = 500px (Fits in 500 exactly)
        
        const tileSize = parseInt(reactor.style.getPropertyValue('--tile-size'));
        expect(tileSize).toBe(10); // Clamped to min
        
        expect(parseInt(reactor.style.height)).toBeLessThanOrEqual(500);
    });
});

