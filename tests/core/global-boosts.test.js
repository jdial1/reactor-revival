import { describe, it, expect, beforeEach, afterEach, setupGame, toNum } from '../helpers/setup.js';

describe('Global Boost Research Upgrades', () => {
    let game;

    // List of global boost upgrade IDs
    const globalBoostsIds = [
        'infused_cells',
        'unleashed_cells',
        'quantum_buffering',
        'full_spectrum_reflectors',
        'fluid_hyperdynamics',
        'fractal_piping',
        'ultracryonics',
        'phlembotinum_core',
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
        it('infused_cells should multiply cell power but not heat', () => {
            const upgrade = game.upgradeset.getUpgrade('infused_cells');
            const part = game.partset.getPartById('uranium1');
            const initialPower = part.base_power;
            const initialHeat = part.base_heat;

            upgrade.setLevel(5);
            part.recalculate_stats();

            const expectedMultiplier = Math.pow(2, 5); // 32x
            expect(part.power).toBe(initialPower * expectedMultiplier);
            expect(part.heat).toBe(initialHeat);
        });

        it('unleashed_cells should multiply cell power and heat', () => {
            const upgrade = game.upgradeset.getUpgrade('unleashed_cells');
            const part = game.partset.getPartById('uranium1');
            const initialPower = part.base_power;
            const initialHeat = part.base_heat;

            upgrade.setLevel(5);
            part.recalculate_stats();

            const expectedMultiplier = Math.pow(2, 5); // 32x
            expect(part.power).toBe(initialPower * expectedMultiplier);
            expect(part.heat).toBe(initialHeat * expectedMultiplier);
        });

        it('quantum_buffering should multiply capacitor/plating effects', () => {
            const upgrade = game.upgradeset.getUpgrade('quantum_buffering');
            const capacitor = game.partset.getPartById('capacitor1');
            const plating = game.partset.getPartById('reactor_plating1');
            const initialCapPower = capacitor.base_reactor_power;
            const initialCapContainment = capacitor.base_containment;
            const initialPlatingHeat = plating.base_reactor_heat;

            upgrade.setLevel(5);
            capacitor.recalculate_stats();
            plating.recalculate_stats();

            const expectedMultiplier = Math.pow(2, 5); // 32x
            expect(capacitor.reactor_power).toBe(initialCapPower * expectedMultiplier);
            expect(capacitor.containment).toBe(initialCapContainment * expectedMultiplier);
            expect(plating.reactor_heat).toBe(initialPlatingHeat * expectedMultiplier);
        });

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

        it('phlembotinum_core (Zero-Point Core) should multiply base reactor capacity', async () => {
            const upgrade = game.upgradeset.getUpgrade('phlembotinum_core');
            expect(upgrade).toBeTruthy(); // Ensure upgrade exists

            const capacitor = game.partset.getPartById('capacitor1');
            const plating = game.partset.getPartById('reactor_plating1');

            const initialMaxPower = game.reactor.base_max_power;
            const initialMaxHeat = game.reactor.base_max_heat;

            upgrade.setLevel(5); // This calls executeUpgradeAction which sets altered_max_power/heat

            // Test with empty grid first
            game.reactor.updateStats();

            const multiplier = Math.pow(4, 5);
            expect(toNum(game.reactor.max_power)).toBeCloseTo(toNum(initialMaxPower) * multiplier, 5);
            expect(toNum(game.reactor.max_heat)).toBeCloseTo(toNum(initialMaxHeat) * multiplier, 5);

            // Test with parts to ensure their values are added on top
            await game.tileset.getTile(0, 0).setPart(capacitor);
            await game.tileset.getTile(0, 1).setPart(plating);
            game.reactor.updateStats();

            expect(toNum(game.reactor.max_power)).toBeCloseTo(toNum(initialMaxPower) * multiplier + toNum(capacitor.reactor_power), 5);
            expect(toNum(game.reactor.max_heat)).toBeCloseTo(toNum(initialMaxHeat) * multiplier + toNum(plating.reactor_heat), 5);
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