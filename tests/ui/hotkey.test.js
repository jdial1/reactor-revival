import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setupGameWithDOM } from '../helpers/setup.js';

describe('EP Hotkey Functionality', () => {
    let game;
    let document;

    beforeEach(async () => {
        const setup = await setupGameWithDOM();
        game = setup.game;
        document = setup.document;
    });

    afterEach(() => {
        if (game.engine) {
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

        // Verify that all EP values increased by 1
        expect(game.exotic_particles).toBe(initialEP + 1);
        expect(game.total_exotic_particles).toBe(initialTotalEP + 1);
        expect(game.current_exotic_particles).toBe(initialCurrentEP + 1);

        // Verify state manager values
        expect(game.ui.stateManager.getVar("exotic_particles")).toBe(initialEP + 1);
        expect(game.ui.stateManager.getVar("total_exotic_particles")).toBe(initialTotalEP + 1);
        expect(game.ui.stateManager.getVar("current_exotic_particles")).toBe(initialCurrentEP + 1);

        // Verify that affordability was checked
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

        // Verify that all EP values increased by 1
        expect(game.exotic_particles).toBe(initialEP + 1);
        expect(game.total_exotic_particles).toBe(initialTotalEP + 1);
        expect(game.current_exotic_particles).toBe(initialCurrentEP + 1);

        // Verify state manager values
        expect(game.ui.stateManager.getVar("exotic_particles")).toBe(initialEP + 1);
        expect(game.ui.stateManager.getVar("total_exotic_particles")).toBe(initialTotalEP + 1);
        expect(game.ui.stateManager.getVar("current_exotic_particles")).toBe(initialCurrentEP + 1);

        // Verify that affordability was checked
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
        expect(game.exotic_particles).toBeGreaterThan(0);
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

    it('should not trigger when CTRL is pressed with other keys', () => {
        // Set initial EP
        const initialEP = game.exotic_particles;
        game.ui.stateManager.setVar("exotic_particles", initialEP);

        // Simulate CTRL+A keypress
        const event = new KeyboardEvent('keydown', {
            key: 'a',
            ctrlKey: true,
            bubbles: true
        });

        document.dispatchEvent(event);

        // Verify that EP did not change
        expect(game.exotic_particles).toBe(initialEP);
        expect(game.ui.stateManager.getVar("exotic_particles")).toBe(initialEP);
    });
}); 