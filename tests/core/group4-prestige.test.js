import { describe, it, expect, beforeEach, afterEach, vi, setupGame, toNum } from "../helpers/setup.js";
import { placePart } from "../helpers/gameHelpers.js";
import {
  EP_CHANCE_LOG_BASE,
  PRESTIGE_MULTIPLIER_CAP,
  PRESTIGE_MULTIPLIER_PER_EP,
} from "../../public/src/utils.js";

describe("Group 4: Exotic Particles & Prestige", () => {
  let game;

  beforeEach(async () => {
    game = await setupGame();
    game.bypass_tech_tree_restrictions = true;
  });

  afterEach(() => {
    if (game?.engine) game.engine.stop();
  });

  it("locks particle accelerator EP logarithmic conversion", async () => {
    const acceleratorTile = await placePart(game, 0, 0, "particle_accelerator1");
    const targetHeat = Math.pow(EP_CHANCE_LOG_BASE, 2);
    acceleratorTile.part.ep_heat = targetHeat;
    acceleratorTile.heat_contained = targetHeat;

    const curBefore = toNum(game.state.current_exotic_particles);
    const totalBefore = toNum(game.state.total_exotic_particles);
    const sessionBefore = toNum(game.exotic_particles);
    const expectedChance =
      (Math.log(targetHeat) / Math.log(EP_CHANCE_LOG_BASE)) *
      (targetHeat / acceleratorTile.part.ep_heat);
    const expectedGain = Math.floor(expectedChance);

    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.999999);
    game.engine.tick();
    randomSpy.mockRestore();

    const deltaCurrent = toNum(game.state.current_exotic_particles) - curBefore;
    const deltaTotal = toNum(game.state.total_exotic_particles) - totalBefore;
    const deltaSession = toNum(game.exotic_particles) - sessionBefore;
    expect(expectedChance).toBe(2);
    expect(deltaCurrent).toBe(expectedGain);
    expect(deltaTotal).toBe(expectedGain);
    expect(deltaSession).toBe(expectedGain);
  });

  it("locks stacked particle accelerators summing EP chance add", async () => {
    const a = await placePart(game, 0, 0, "particle_accelerator1");
    const b = await placePart(game, 0, 1, "particle_accelerator1");
    const targetHeat = Math.pow(EP_CHANCE_LOG_BASE, 2);
    a.part.ep_heat = targetHeat;
    b.part.ep_heat = targetHeat;
    a.heat_contained = targetHeat;
    b.heat_contained = targetHeat;

    const curBefore = toNum(game.state.current_exotic_particles);
    const totalBefore = toNum(game.state.total_exotic_particles);
    const sessionBefore = toNum(game.exotic_particles);
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.999999);
    game.engine.tick();
    randomSpy.mockRestore();

    const singleChance =
      (Math.log(targetHeat) / Math.log(EP_CHANCE_LOG_BASE)) *
      (targetHeat / targetHeat);
    expect(singleChance).toBe(2);
    const expectedGain = Math.floor(singleChance) * 2;
    expect(toNum(game.state.current_exotic_particles) - curBefore).toBe(expectedGain);
    expect(toNum(game.state.total_exotic_particles) - totalBefore).toBe(expectedGain);
    expect(toNum(game.exotic_particles) - sessionBefore).toBe(expectedGain);
  });

  it("locks repeated engine ticks deterministically stacking EP when heat persists", async () => {
    const acceleratorTile = await placePart(game, 0, 0, "particle_accelerator1");
    const targetHeat = Math.pow(EP_CHANCE_LOG_BASE, 2);
    acceleratorTile.part.ep_heat = targetHeat;
    acceleratorTile.heat_contained = targetHeat;
    const perTickGain = 2;
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.999999);
    const cur0 = toNum(game.state.current_exotic_particles);
    game.engine.tick();
    expect(toNum(game.state.current_exotic_particles) - cur0).toBe(perTickGain);
    const cur1 = toNum(game.state.current_exotic_particles);
    game.engine.tick();
    expect(toNum(game.state.current_exotic_particles) - cur1).toBe(perTickGain);
    randomSpy.mockRestore();
  });

  it("locks particle accelerator fractional EP chance with stochastic rounding", async () => {
    const acceleratorTile = await placePart(game, 0, 0, "particle_accelerator1");
    const lowerHeat = 1000;
    acceleratorTile.heat_contained = lowerHeat;
    acceleratorTile.part.ep_heat = (lowerHeat * 3) / 2.3;
    const expectedChance =
      (Math.log(lowerHeat) / Math.log(EP_CHANCE_LOG_BASE)) *
      (lowerHeat / acceleratorTile.part.ep_heat);
    expect(Math.floor(expectedChance)).toBe(2);
    expect(Math.round(expectedChance * 10)).toBe(23);

    const curBefore = toNum(game.state.current_exotic_particles);
    const totalBefore = toNum(game.state.total_exotic_particles);
    const sessionBefore = toNum(game.exotic_particles);
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.1);
    game.engine.tick();
    randomSpy.mockRestore();

    expect(toNum(game.state.current_exotic_particles) - curBefore).toBe(3);
    expect(toNum(game.state.total_exotic_particles) - totalBefore).toBe(3);
    expect(toNum(game.exotic_particles) - sessionBefore).toBe(3);
  });

  it("locks particle accelerator fractional EP chance without stochastic rounding", async () => {
    const acceleratorTile = await placePart(game, 0, 0, "particle_accelerator1");
    const lowerHeat = 1000;
    acceleratorTile.heat_contained = lowerHeat;
    acceleratorTile.part.ep_heat = (lowerHeat * 3) / 2.3;

    const curBefore = toNum(game.state.current_exotic_particles);
    const totalBefore = toNum(game.state.total_exotic_particles);
    const sessionBefore = toNum(game.exotic_particles);
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.5);
    game.engine.tick();
    randomSpy.mockRestore();

    expect(toNum(game.state.current_exotic_particles) - curBefore).toBe(2);
    expect(toNum(game.state.total_exotic_particles) - totalBefore).toBe(2);
    expect(toNum(game.exotic_particles) - sessionBefore).toBe(2);
  });

  it("locks particle accelerator to zero EP gain when heat is zero", async () => {
    const acceleratorTile = await placePart(game, 0, 0, "particle_accelerator1");
    acceleratorTile.part.ep_heat = 1000;
    acceleratorTile.heat_contained = 0;

    const curBefore = toNum(game.state.current_exotic_particles);
    const totalBefore = toNum(game.state.total_exotic_particles);
    const sessionBefore = toNum(game.exotic_particles);
    game.engine.tick();

    expect(toNum(game.state.current_exotic_particles)).toBe(curBefore);
    expect(toNum(game.state.total_exotic_particles)).toBe(totalBefore);
    expect(toNum(game.exotic_particles)).toBe(sessionBefore);
  });

  it("locks particle accelerator to zero EP gain when ep_heat is invalid", async () => {
    const acceleratorTile = await placePart(game, 0, 0, "particle_accelerator1");
    acceleratorTile.part.ep_heat = 0;
    acceleratorTile.heat_contained = 1000;

    const curBefore = toNum(game.state.current_exotic_particles);
    const totalBefore = toNum(game.state.total_exotic_particles);
    const sessionBefore = toNum(game.exotic_particles);
    game.engine.tick();

    expect(toNum(game.state.current_exotic_particles)).toBe(curBefore);
    expect(toNum(game.state.total_exotic_particles)).toBe(totalBefore);
    expect(toNum(game.exotic_particles)).toBe(sessionBefore);
  });

  it("locks keep-EP reboot state isolation", async () => {
    game.exoticParticleManager.grantCheatExoticParticle(100);
    game.current_money = 999999;
    game.reactor.current_heat = 777;
    await placePart(game, 0, 0, "uranium1");

    const epCurrentBefore = toNum(game.state.current_exotic_particles);
    const epTotalBefore = toNum(game.state.total_exotic_particles);
    expect(epCurrentBefore).toBe(epTotalBefore);
    expect(game.getPrestigeMultiplier()).toBe(1 + epTotalBefore * PRESTIGE_MULTIPLIER_PER_EP);

    const standardUpgrade = game.upgradeset.getUpgrade("chronometer");
    standardUpgrade.setLevel(1);
    const laboratory = game.upgradeset.getUpgrade("laboratory");
    laboratory.setLevel(1);

    await game.rebootActionKeepExoticParticles();

    expect(toNum(game.exotic_particles)).toBe(0);
    expect(toNum(game.state.current_exotic_particles)).toBe(epCurrentBefore);
    expect(toNum(game.state.total_exotic_particles)).toBe(epTotalBefore);
    expect(toNum(game.current_money)).toBe(toNum(game.base_money));
    expect(toNum(game.reactor.current_heat)).toBe(0);
    expect(toNum(game.reactor.current_power)).toBe(0);
    expect(game.tileset.getTile(0, 0).part).toBeNull();
    expect(game.upgradeset.getUpgrade("laboratory").level).toBe(1);
    expect(game.upgradeset.getUpgrade("chronometer").level).toBe(0);
    expect(toNum(game.ui.stateManager.getVar("total_exotic_particles"))).toBe(epTotalBefore);
    expect(toNum(game.ui.stateManager.getVar("current_exotic_particles"))).toBe(epCurrentBefore);
    expect(game.getPrestigeMultiplier()).toBe(1 + epTotalBefore * PRESTIGE_MULTIPLIER_PER_EP);
  });

  it("locks prestige multiplier cap from total exotic particles", () => {
    const grant = 200000;
    const totalBefore = toNum(game.state.total_exotic_particles);
    game.exoticParticleManager.grantCheatExoticParticle(grant);
    const epTotal = toNum(game.state.total_exotic_particles);
    expect(epTotal).toBe(totalBefore + grant);
    expect(Math.min(epTotal * PRESTIGE_MULTIPLIER_PER_EP, PRESTIGE_MULTIPLIER_CAP)).toBe(
      PRESTIGE_MULTIPLIER_CAP
    );
    expect(game.getPrestigeMultiplier()).toBe(1 + PRESTIGE_MULTIPLIER_CAP);
  });

  it("locks discard-EP reboot clearing all exotic particle state", async () => {
    game.exoticParticleManager.grantCheatExoticParticle(100);
    game.current_money = 5000;
    await placePart(game, 0, 0, "uranium1");
    game.upgradeset.getUpgrade("laboratory").setLevel(1);

    await game.rebootActionDiscardExoticParticles();

    expect(toNum(game.state.current_exotic_particles)).toBe(0);
    expect(toNum(game.state.total_exotic_particles)).toBe(0);
    expect(toNum(game.exotic_particles)).toBe(0);
    expect(toNum(game.state.reality_flux)).toBe(0);
    expect(toNum(game.current_money)).toBe(toNum(game.base_money));
    expect(game.tileset.getTile(0, 0).part).toBeNull();
    expect(toNum(game.ui.stateManager.getVar("current_exotic_particles"))).toBe(0);
    expect(toNum(game.ui.stateManager.getVar("total_exotic_particles"))).toBe(0);
    expect(game.getPrestigeMultiplier()).toBe(1);
    expect(game.upgradeset.getUpgrade("laboratory").level).toBe(0);
  });

  it("locks experimental upgrade purchases to EP spending", () => {
    const laboratory = game.upgradeset.getUpgrade("laboratory");
    laboratory.setLevel(1);
    const targetUpgrade = game.upgradeset.getUpgrade("fractal_piping");
    targetUpgrade.updateDisplayCost();
    const epCost = toNum(targetUpgrade.getEcost());

    game.current_money = 250000;
    game.current_exotic_particles = epCost + 50;
    game.ui.stateManager.setVar("current_money", game.current_money);
    game.ui.stateManager.setVar("current_exotic_particles", game.current_exotic_particles);
    game.upgradeset.check_affordability(game);

    const moneyBefore = toNum(game.current_money);
    const epBefore = toNum(game.state.current_exotic_particles);
    const totalBefore = toNum(game.state.total_exotic_particles);
    const sessionEpBefore = toNum(game.exotic_particles);
    const purchased = game.upgradeset.purchaseUpgrade(targetUpgrade.id);

    expect(purchased).toBe(true);
    expect(epCost).toBe(50);
    expect(targetUpgrade.level).toBe(1);
    expect(toNum(game.state.current_exotic_particles)).toBe(epBefore - epCost);
    expect(toNum(game.state.total_exotic_particles)).toBe(totalBefore);
    expect(toNum(game.exotic_particles)).toBe(sessionEpBefore);
    expect(toNum(game.current_money)).toBe(moneyBefore);
    expect(toNum(game.ui.stateManager.getVar("current_exotic_particles"))).toBe(toNum(game.state.current_exotic_particles));
  });
});
