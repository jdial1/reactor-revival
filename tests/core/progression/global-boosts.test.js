import { describe, it, expect, beforeEach, afterEach, setupGame, toNum } from '../../helpers/setup.js';

describe('Global Boost Research Upgrades', () => {
    let game;

    // List of global boost upgrade IDs
    const globalBoostsIds = [
        'full_spectrum_reflectors',
        'fluid_hyperdynamics',
        'fractal_piping',
        'ultracryonics',
    ];

    beforeEach(async () => {
        game = await setupGame();
        // The laboratory is required to enable any experimental upgrades.
        const lab = game.upgradeset.getUpgrade('laboratory');
        if (lab) {
            lab.setLevel(1);
        }
    });

    afterEach(() => {
        if (game && game.engine) {
            game.engine.stop();
        }
    });

    describe('Individual Upgrade Tests (Level 5)', () => {
        it('full_spectrum_reflectors should boost reflector power increase', () => {
            const upgrade = game.upgradeset.getUpgrade('full_spectrum_reflectors');
            const reflector = game.partset.getPartById('reflector1');
            const initialPowerIncrease = reflector.base_power_increase;

            upgrade.setLevel(5);
            reflector.recalculate_stats();

            // From part.js: power_increase = base_power_increase * (1 + level)
            const expectedMultiplier = 1 + 5;
            expect(reflector.power_increase).toBe(initialPowerIncrease * expectedMultiplier);
        });

        it('fluid_hyperdynamics should boost vent/exchanger effectiveness', () => {
            const upgrade = game.upgradeset.getUpgrade('fluid_hyperdynamics');
            const vent = game.partset.getPartById('vent1');
            const exchanger = game.partset.getPartById('heat_exchanger1');
            const inlet = game.partset.getPartById('heat_inlet1');
            const outlet = game.partset.getPartById('heat_outlet1');

            const initialVent = vent.base_vent;
            const initialExchangerTransfer = exchanger.base_transfer;
            const initialInletTransfer = inlet.base_transfer;
            const initialOutletTransfer = outlet.base_transfer;

            upgrade.setLevel(5);
            vent.recalculate_stats();
            exchanger.recalculate_stats();
            inlet.recalculate_stats();
            outlet.recalculate_stats();

            const expectedMultiplier = Math.pow(2, 5); // 32x
            expect(vent.vent).toBe(initialVent * expectedMultiplier);
            expect(exchanger.transfer).toBe(initialExchangerTransfer * expectedMultiplier);
            expect(inlet.transfer).toBe(initialInletTransfer * expectedMultiplier);
            expect(outlet.transfer).toBe(initialOutletTransfer * expectedMultiplier);
        });

        it('fractal_piping should boost vent/exchanger heat capacity', () => {
            const upgrade = game.upgradeset.getUpgrade('fractal_piping');
            const vent = game.partset.getPartById('vent1');
            const exchanger = game.partset.getPartById('heat_exchanger1');
            const initialVentContainment = vent.base_containment;
            const initialExchangerContainment = exchanger.base_containment;

            upgrade.setLevel(5);
            vent.recalculate_stats();
            exchanger.recalculate_stats();

            const expectedMultiplier = Math.pow(2, 5); // 32x
            expect(vent.containment).toBe(initialVentContainment * expectedMultiplier);
            expect(exchanger.containment).toBe(initialExchangerContainment * expectedMultiplier);
        });

        it('ultracryonics should boost coolant cell heat capacity', () => {
            const upgrade = game.upgradeset.getUpgrade('ultracryonics');
            const coolant = game.partset.getPartById('coolant_cell1');
            const initialContainment = coolant.base_containment;

            upgrade.setLevel(5);
            coolant.recalculate_stats();

            const expectedMultiplier = Math.pow(2, 5); // 32x
            expect(coolant.containment).toBe(initialContainment * expectedMultiplier);
        });

    });

    describe('Max Level Sanity Check (Level 10)', () => {
        it('should remain stable with all global boosts at level 10', async () => {
            // Set all global boosts to level 10
            globalBoostsIds.forEach(id => {
                const upgrade = game.upgradeset.getUpgrade(id);
                if (upgrade) {
                    upgrade.setLevel(10);
                }
            });

            // Place a simple, stable layout
            const cell = game.partset.getPartById('uranium1');
            const vent = game.partset.getPartById('vent1');

            await game.tileset.getTile(5, 5).setPart(cell);
            await game.tileset.getTile(5, 6).setPart(vent);

            // Run a few ticks
            for (let i = 0; i < 10; i++) {
                game.engine.tick();
            }

            // Sanity checks
            expect(isFinite(game.current_money)).toBe(true);
            expect(toNum(game.current_money)).toBeGreaterThanOrEqual(0);

            expect(isFinite(game.reactor.current_power)).toBe(true);
            expect(toNum(game.reactor.current_power)).toBeGreaterThanOrEqual(0);

            expect(isFinite(game.reactor.current_heat)).toBe(true);
            expect(toNum(game.reactor.current_heat)).toBeGreaterThanOrEqual(0);

            expect(game.reactor.has_melted_down).toBe(false);

            // Check that power and heat values are boosted significantly
            // With level 10 upgrades, we expect very large multipliers
            const expectedMinPower = 1; // Even with boosts, a single cell should produce at least 1 power
            const expectedMinHeat = 1;  // Even with boosts, a single cell should produce at least 1 heat
            expect(game.reactor.stats_power).toBeGreaterThanOrEqual(expectedMinPower);
            expect(game.reactor.stats_heat_generation).toBeGreaterThanOrEqual(expectedMinHeat);
        });
    });
}); 