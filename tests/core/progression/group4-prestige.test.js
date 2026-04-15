import { describe, it, expect, beforeEach, afterEach, setupGame, toNum } from "../../helpers/setup.js";
import { patchGameState } from "@app/state.js";
import { placePart } from "../../helpers/gameHelpers.js";
import { setDecimal } from "@app/store.js";
import { toDecimal } from "@app/utils.js";
import {
  PRESTIGE_MULTIPLIER_CAP,
  PRESTIGE_MULTIPLIER_PER_EP,
} from "@app/utils.js";
import {
  cappedPrestigeEpContribution,
  expectedPrestigeMultiplierFromTotalEp,
} from "../../helpers/setup.js";

describe("Group 4: Exotic Particles & Prestige", () => {
  let game;

  beforeEach(async () => {
    game = await setupGame();
    game.bypass_tech_tree_restrictions = true;
  });

  afterEach(() => {
    if (game?.engine) game.engine.stop();
  });

  it("locks defining weave EP on keep-EP reboot from session min", async () => {
    setDecimal(game.state, "total_exotic_particles", 0);
    setDecimal(game.state, "current_exotic_particles", 0);
    game.exoticParticleManager.exotic_particles = toDecimal(0);
    setDecimal(game.state, "session_power_produced", 4_000_000);
    setDecimal(game.state, "session_heat_dissipated", 5_000_000);
    await game.rebootActionKeepExoticParticles();
    expect(toNum(game.state.total_exotic_particles)).toBe(4);
    expect(toNum(game.state.current_exotic_particles)).toBe(4);
  });

  it("locks no EP weave grant when session min is below 1e6", async () => {
    setDecimal(game.state, "total_exotic_particles", 10);
    setDecimal(game.state, "current_exotic_particles", 10);
    game.exoticParticleManager.exotic_particles = toDecimal(10);
    setDecimal(game.state, "session_power_produced", 500_000);
    setDecimal(game.state, "session_heat_dissipated", 600_000);
    await game.rebootActionKeepExoticParticles();
    expect(toNum(game.state.total_exotic_particles)).toBe(10);
  });

  it("locks engine ticks do not grant EP from particle accelerators alone", async () => {
    const acceleratorTile = await placePart(game, 0, 0, "particle_accelerator1");
    acceleratorTile.part.ep_heat = 1000;
    acceleratorTile.heat_contained = 1000;
    const curBefore = toNum(game.state.current_exotic_particles);
    game.engine.tick();
    expect(toNum(game.state.current_exotic_particles)).toBe(curBefore);
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
    expect(game.getPrestigeMultiplier()).toBe(expectedPrestigeMultiplierFromTotalEp(epTotalBefore));

    const standardUpgrade = game.upgradeset.getUpgrade("chronometer");
    standardUpgrade.setLevel(1);
    const laboratory = game.upgradeset.getUpgrade("laboratory");
    laboratory.setLevel(1);

    setDecimal(game.state, "session_power_produced", 0);
    setDecimal(game.state, "session_heat_dissipated", 0);

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
    expect(game.getPrestigeMultiplier()).toBe(expectedPrestigeMultiplierFromTotalEp(epTotalBefore));
  });

  it("locks prestige multiplier cap from total exotic particles", () => {
    const grant = 200000;
    const totalBefore = toNum(game.state.total_exotic_particles);
    game.exoticParticleManager.grantCheatExoticParticle(grant);
    const epTotal = toNum(game.state.total_exotic_particles);
    expect(epTotal).toBe(totalBefore + grant);
    expect(cappedPrestigeEpContribution(epTotal)).toBe(PRESTIGE_MULTIPLIER_CAP);
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
    expect(toNum(game.current_money)).toBe(toNum(game.base_money));
    expect(game.tileset.getTile(0, 0).part).toBeNull();
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
    patchGameState(game, { current_money: game.current_money, current_exotic_particles: game.current_exotic_particles });
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
  });
});
