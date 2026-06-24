import { describe, it, expect, beforeEach, afterEach, setupGameWithDOM, toNum, simulateKeyPress } from '../helpers/setup.js';
import { patchGameState } from "@app/state.js";

describe('Production cheat absence', () => {
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

    it('should not add EP when CTRL+E is pressed', () => {
        const initialEP = game.exotic_particles;
        const initialTotalEP = game.total_exotic_particles;
        const initialCurrentEP = game.current_exotic_particles;

        patchGameState(game, {
          exotic_particles: initialEP,
          total_exotic_particles: initialTotalEP,
          current_exotic_particles: initialCurrentEP,
        });

        simulateKeyPress(document, 'e', { ctrlKey: true });

        expect(toNum(game.exotic_particles)).toBe(toNum(initialEP));
        expect(toNum(game.total_exotic_particles)).toBe(toNum(initialTotalEP));
        expect(toNum(game.current_exotic_particles)).toBe(toNum(initialCurrentEP));
    });

    it('should not add money when CTRL+9 is pressed', () => {
        const initialMoney = game.current_money;
        patchGameState(game, { current_money: initialMoney });

        simulateKeyPress(document, '9', { ctrlKey: true });

        expect(toNum(game.current_money)).toBe(toNum(initialMoney));
        expect(game.ui?.ctrl9MoneyInterval).toBeFalsy();
    });
});
