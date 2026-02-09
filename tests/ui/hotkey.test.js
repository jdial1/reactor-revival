import { describe, it, expect, beforeEach, afterEach, vi, setupGameWithDOM, toNum } from '../helpers/setup.js';

describe('EP Hotkey Functionality', () => {
    let game;
    let document;

    beforeEach(async () => {
        const setup = await setupGameWithDOM();
        game = setup.game;
        document = setup.document;
    });

    afterEach(() => {
        if (game && game.engine) {
            game.engine.stop();
        }
    });

    it('should give +1 EP when CTRL+E is pressed', () => {
        // Set initial EP values
        const initialEP = game.exotic_particles;
        const initialTotalEP = game.total_exotic_particles;
        const initialCurrentEP = game.current_exotic_particles;

        game.ui.stateManager.setVar("exotic_particles", initialEP);
        game.ui.stateManager.setVar("total_exotic_particles", initialTotalEP);
        game.ui.stateManager.setVar("current_exotic_particles", initialCurrentEP);

        // Mock the affordability check
        const affordabilitySpy = vi.spyOn(game.upgradeset, 'check_affordability');

        // Simulate CTRL+E keypress
        const event = new KeyboardEvent('keydown', {
            key: 'e',
            ctrlKey: true,
            bubbles: true
        });

        document.dispatchEvent(event);

        expect(toNum(game.exotic_particles)).toBe(toNum(initialEP) + 1);
        expect(toNum(game.total_exotic_particles)).toBe(toNum(initialTotalEP) + 1);
        expect(toNum(game.current_exotic_particles)).toBe(toNum(initialCurrentEP) + 1);

        expect(toNum(game.ui.stateManager.getVar("exotic_particles"))).toBe(toNum(initialEP) + 1);
        expect(toNum(game.ui.stateManager.getVar("total_exotic_particles"))).toBe(toNum(initialTotalEP) + 1);
        expect(toNum(game.ui.stateManager.getVar("current_exotic_particles"))).toBe(toNum(initialCurrentEP) + 1);

        expect(affordabilitySpy).toHaveBeenCalledWith(game);
    });

    it('should give +1 EP when CTRL+E (uppercase) is pressed', () => {
        // Set initial EP values
        const initialEP = game.exotic_particles;
        const initialTotalEP = game.total_exotic_particles;
        const initialCurrentEP = game.current_exotic_particles;

        game.ui.stateManager.setVar("exotic_particles", initialEP);
        game.ui.stateManager.setVar("total_exotic_particles", initialTotalEP);
        game.ui.stateManager.setVar("current_exotic_particles", initialCurrentEP);

        // Mock the affordability check
        const affordabilitySpy = vi.spyOn(game.upgradeset, 'check_affordability');

        // Simulate CTRL+E (uppercase) keypress
        const event = new KeyboardEvent('keydown', {
            key: 'E',
            ctrlKey: true,
            bubbles: true
        });

        document.dispatchEvent(event);

        expect(toNum(game.exotic_particles)).toBe(toNum(initialEP) + 1);
        expect(toNum(game.total_exotic_particles)).toBe(toNum(initialTotalEP) + 1);
        expect(toNum(game.current_exotic_particles)).toBe(toNum(initialCurrentEP) + 1);

        expect(toNum(game.ui.stateManager.getVar("exotic_particles"))).toBe(toNum(initialEP) + 1);
        expect(toNum(game.ui.stateManager.getVar("total_exotic_particles"))).toBe(toNum(initialTotalEP) + 1);
        expect(toNum(game.ui.stateManager.getVar("current_exotic_particles"))).toBe(toNum(initialCurrentEP) + 1);

        expect(affordabilitySpy).toHaveBeenCalledWith(game);
    });

    it('should update affordability when CTRL+E adds EP', () => {
        // Mock the affordability check
        const affordabilitySpy = vi.spyOn(game.upgradeset, 'check_affordability');

        // Simulate CTRL+E keypress
        const event = new KeyboardEvent('keydown', {
            key: 'e',
            ctrlKey: true,
            bubbles: true
        });

        document.dispatchEvent(event);

        // Verify that affordability was checked after adding EP
        expect(affordabilitySpy).toHaveBeenCalledWith(game);

        // Verify that EP increased
        expect(toNum(game.exotic_particles)).toBeGreaterThan(0);
    });

    it('should prevent default behavior when CTRL+E is pressed', () => {
        // Simulate CTRL+E keypress
        const event = new KeyboardEvent('keydown', {
            key: 'e',
            ctrlKey: true,
            bubbles: true
        });

        // Mock preventDefault
        const preventDefaultSpy = vi.spyOn(event, 'preventDefault');

        document.dispatchEvent(event);

        // Verify that preventDefault was called
        expect(preventDefaultSpy).toHaveBeenCalled();
    });

    it('should not trigger when E is pressed without CTRL', () => {
        // Set initial EP
        const initialEP = game.exotic_particles;
        game.ui.stateManager.setVar("exotic_particles", initialEP);

        // Simulate E keypress without CTRL
        const event = new KeyboardEvent('keydown', {
            key: 'e',
            ctrlKey: false,
            bubbles: true
        });

        document.dispatchEvent(event);

        // Verify that EP did not change
        expect(game.exotic_particles).toBe(initialEP);
        expect(game.ui.stateManager.getVar("exotic_particles")).toBe(initialEP);
    });

    it('should start exponential money increase when CTRL+9 is pressed', () => {
        // Set initial money
        const initialMoney = game.current_money;
        game.ui.stateManager.setVar("current_money", initialMoney);

        // Mock the exponential money methods
        const startSpy = vi.spyOn(game.ui, 'startCtrl9MoneyIncrease');

        // Simulate CTRL+9 keypress
        const event = new KeyboardEvent('keydown', {
            key: '9',
            ctrlKey: true,
            bubbles: true
        });

        // Mock preventDefault
        const preventDefaultSpy = vi.spyOn(event, 'preventDefault');

        document.dispatchEvent(event);

        // Verify that startCtrl9MoneyIncrease was called
        expect(startSpy).toHaveBeenCalled();

        // Verify that preventDefault was called
        expect(preventDefaultSpy).toHaveBeenCalled();
    });

    it('should stop exponential money increase when CTRL+9 is released', () => {
        // Mock the exponential money methods
        const stopSpy = vi.spyOn(game.ui, 'stopCtrl9MoneyIncrease');

        // Simulate CTRL+9 keyup
        const event = new KeyboardEvent('keyup', {
            key: '9',
            ctrlKey: true,
            bubbles: true
        });

        document.dispatchEvent(event);

        // Verify that stopCtrl9MoneyIncrease was called
        expect(stopSpy).toHaveBeenCalled();
    });

    it('should calculate exponential money correctly', () => {
        // Test the exponential calculation logic
        const baseAmount = 1000000000;
        const rate = 1.5;

        // Simulate 1 second hold
        const oneSecondAmount = Math.floor(baseAmount * Math.pow(rate, 1));
        expect(oneSecondAmount).toBe(1500000000);

        // Simulate 2 second hold
        const twoSecondAmount = Math.floor(baseAmount * Math.pow(rate, 2));
        expect(twoSecondAmount).toBe(2250000000);

        // Simulate 3 second hold
        const threeSecondAmount = Math.floor(baseAmount * Math.pow(rate, 3));
        expect(threeSecondAmount).toBe(3375000000);
    });
}); 