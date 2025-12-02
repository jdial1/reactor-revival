import { describe, it, expect, beforeEach, setupGame } from "../helpers/setup.js";

describe("Audio Spatial Panning", () => {
    let game;

    beforeEach(async () => {
        game = await setupGame();
        // Ensure grid dimensions are set for calculation
        game.cols = 10;
    });

    it("should calculate correct stereo pan values based on column index", () => {
        // calculatePan(col) -> -1.0 (left) to 1.0 (right)
        
        // Far left (col 0)
        expect(game.calculatePan(0)).toBeCloseTo(-1.0);
        
        // Far right (col 9)
        expect(game.calculatePan(9)).toBeCloseTo(1.0);
        
        // Center-ish
        // 10 cols: 0..9. Center is 4.5.
        // Col 4: (4/9)*2 - 1 = 0.88 - 1 = -0.11
        // Col 5: (5/9)*2 - 1 = 1.11 - 1 = 0.11
        const midLeft = game.calculatePan(4);
        const midRight = game.calculatePan(5);
        
        expect(midLeft).toBeLessThan(0);
        expect(midRight).toBeGreaterThan(0);
        expect(Math.abs(midLeft)).toBeLessThan(0.2);
    });

    it("should handle single column grid gracefully", () => {
        game.cols = 1;
        expect(game.calculatePan(0)).toBe(0);
    });

    it("should adjust panning dynamically when grid resizes", () => {
        game.cols = 5; // 0..4
        // Far right is col 4
        expect(game.calculatePan(4)).toBe(1.0);
        // Center is col 2
        expect(game.calculatePan(2)).toBe(0);

        game.cols = 21; // 0..20
        // Far right is col 20
        expect(game.calculatePan(20)).toBe(1.0);
        // Center is col 10
        expect(game.calculatePan(10)).toBe(0);
    });
});

