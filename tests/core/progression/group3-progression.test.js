import { describe, it, expect, beforeEach, setupGame, toNum, performTestRespec } from "../../helpers/setup.js";

describe("Group 3: Progression & Tech Tree", () => {
  let game;

  beforeEach(async () => {
    game = await setupGame();
  });

  it("locks upgrade cost scaling mathematics", () => {
    const upgrade = game.upgradeset.getUpgrade("chronometer");
    const baseCost = toNum(upgrade.base_cost);
    const multiplier = upgrade.cost_multiplier;
    expect(baseCost).toBe(10000);
    expect(multiplier).toBe(100);

    upgrade.setLevel(0);
    upgrade.updateDisplayCost();
    expect(toNum(upgrade.current_cost)).toBe(baseCost);
    expect(toNum(upgrade.current_cost)).toBe(baseCost * Math.pow(multiplier, 0));

    upgrade.setLevel(1);
    upgrade.updateDisplayCost();
    expect(toNum(upgrade.current_cost)).toBe(baseCost * Math.pow(multiplier, 1));

    upgrade.setLevel(2);
    upgrade.updateDisplayCost();
    expect(toNum(upgrade.current_cost)).toBe(baseCost * Math.pow(multiplier, 2));
  });

  it("locks experimental upgrade EP cost scaling mathematics", () => {
    const upgrade = game.upgradeset.getUpgrade("infused_cells");
    const baseE = toNum(upgrade.base_ecost);
    const eMult = upgrade.ecost_multiplier;
    expect(baseE).toBe(100);
    expect(eMult).toBe(2);

    upgrade.setLevel(0);
    upgrade.updateDisplayCost();
    expect(toNum(upgrade.current_ecost)).toBe(baseE * Math.pow(eMult, 0));

    upgrade.setLevel(1);
    upgrade.updateDisplayCost();
    expect(toNum(upgrade.current_ecost)).toBe(baseE * Math.pow(eMult, 1));

    upgrade.setLevel(2);
    upgrade.updateDisplayCost();
    expect(toNum(upgrade.current_ecost)).toBe(baseE * Math.pow(eMult, 2));
  });

  it("deducts exact cash when purchasing a money upgrade", () => {
    game.bypass_tech_tree_restrictions = true;
    const upgrade = game.upgradeset.getUpgrade("chronometer");
    upgrade.setLevel(0);
    upgrade.updateDisplayCost();
    const cost = toNum(upgrade.getCost());
    game.current_money = cost;
    game.ui.stateManager.setVar("current_money", game.current_money);
    game.upgradeset.check_affordability(game);
    expect(game.upgradeset.purchaseUpgrade("chronometer")).toBe(true);
    expect(toNum(game.current_money)).toBe(0);
    expect(toNum(game.ui.stateManager.getVar("current_money"))).toBe(0);
    expect(upgrade.level).toBe(1);
  });

  it("deducts exact exotic particles when purchasing an EP upgrade", () => {
    game.bypass_tech_tree_restrictions = true;
    const lab = game.upgradeset.getUpgrade("laboratory");
    lab.setLevel(0);
    lab.updateDisplayCost();
    const ecost = toNum(lab.getEcost());
    expect(ecost).toBe(1);
    game.current_exotic_particles = ecost;
    game.ui.stateManager.setVar("current_exotic_particles", ecost);
    game.upgradeset.check_affordability(game);
    expect(game.upgradeset.purchaseUpgrade("laboratory")).toBe(true);
    expect(toNum(game.current_exotic_particles)).toBe(0);
    expect(toNum(game.ui.stateManager.getVar("current_exotic_particles"))).toBe(0);
    expect(lab.level).toBe(1);
  });

  it("resolves doctrine metadata from DoctrineManager for the active tech tree", () => {
    game.tech_tree = "unified";
    const doctrine = game.getDoctrine();
    expect(doctrine).not.toBeNull();
    expect(doctrine.id).toBe("unified");
    expect(doctrine.title).toBe("Reactor Research");
  });

  it("locks auto-sell power reduction when sell cap is below stored power", () => {
    game.tileset.clearAllTiles();
    game.reactor.auto_sell_enabled = true;
    game.ui.stateManager.setVar("auto_sell", true);

    const maxPower = 1000;
    const autoSellMult = 0.1;
    game.reactor.max_power = maxPower;
    game.reactor.base_max_power = maxPower;
    game.reactor.altered_max_power = maxPower;
    game.reactor.auto_sell_multiplier = autoSellMult;
    game.reactor.sell_price_multiplier = 1;
    game.reactor.current_power = 700;

    const initialPower = toNum(game.reactor.current_power);
    const initialMoney = toNum(game.current_money);
    const sellCap = maxPower * autoSellMult;
    const expectedSold = Math.min(initialPower, sellCap);
    const expectedRemaining = initialPower - expectedSold;

    game.engine.tick();

    expect(toNum(game.reactor.current_power)).toBe(expectedRemaining);
    expect(toNum(game.current_money)).toBe(initialMoney + expectedSold);
  });

  it("locks auto-sell when stored power is below sell cap", () => {
    game.tileset.clearAllTiles();
    game.reactor.auto_sell_enabled = true;
    game.ui.stateManager.setVar("auto_sell", true);

    const maxPower = 1000;
    const autoSellMult = 0.1;
    game.reactor.max_power = maxPower;
    game.reactor.base_max_power = maxPower;
    game.reactor.altered_max_power = maxPower;
    game.reactor.auto_sell_multiplier = autoSellMult;
    game.reactor.sell_price_multiplier = 1;
    game.reactor.current_power = 50;

    const initialPower = toNum(game.reactor.current_power);
    const initialMoney = toNum(game.current_money);
    const sellCap = maxPower * autoSellMult;
    const expectedSold = Math.min(initialPower, sellCap);

    game.engine.tick();

    expect(toNum(game.reactor.current_power)).toBe(initialPower - expectedSold);
    expect(toNum(game.current_money)).toBe(initialMoney + expectedSold);
  });

  it("uses altered max power for auto-sell cap when altered differs from base max", () => {
    game.tileset.clearAllTiles();
    game.reactor.auto_sell_enabled = true;
    game.ui.stateManager.setVar("auto_sell", true);

    const baseMax = 1000;
    const alteredMax = 2000;
    game.reactor.base_max_power = baseMax;
    game.reactor.max_power = baseMax;
    game.reactor.altered_max_power = alteredMax;
    game.reactor.auto_sell_multiplier = 0.1;
    game.reactor.sell_price_multiplier = 1;
    game.reactor.current_power = 500;

    const initialPower = toNum(game.reactor.current_power);
    const initialMoney = toNum(game.current_money);
    const sellCap = alteredMax * 0.1;
    const expectedSold = Math.min(initialPower, sellCap);
    const expectedRemaining = initialPower - expectedSold;

    game.engine.tick();

    expect(toNum(game.reactor.current_power)).toBe(expectedRemaining);
    expect(toNum(game.current_money)).toBe(initialMoney + expectedSold);
  });

  it("does not sell power when auto-sell is disabled", () => {
    game.tileset.clearAllTiles();
    game.reactor.auto_sell_enabled = false;
    game.ui.stateManager.setVar("auto_sell", false);
    game.reactor.max_power = 1000;
    game.reactor.base_max_power = 1000;
    game.reactor.altered_max_power = 1000;
    game.reactor.auto_sell_multiplier = 0.1;
    game.reactor.current_power = 700;

    const initialPower = toNum(game.reactor.current_power);
    const initialMoney = toNum(game.current_money);

    game.engine.tick();

    expect(toNum(game.reactor.current_power)).toBe(initialPower);
    expect(toNum(game.current_money)).toBe(initialMoney);
  });

  it("allows unified-tree upgrades when bypass is disabled and tech_tree matches", () => {
    game.bypass_tech_tree_restrictions = false;
    game.tech_tree = "unified";
    game.current_money = 1e30;
    game.ui.stateManager.setVar("current_money", game.current_money);
    game.upgradeset.check_affordability(game);
    expect(game.upgradeset.isUpgradeAvailable("chronometer")).toBe(true);
    expect(game.upgradeset.isUpgradeAvailable("heat_control_operator")).toBe(true);
    expect(game.upgradeset.isUpgradeAvailable("stirling_generators")).toBe(true);
  });

  it("locks restricted upgrades when tech_tree id does not match loaded trees", () => {
    game.bypass_tech_tree_restrictions = false;
    game.tech_tree = "__nonexistent_doctrine__";
    game.current_money = 1e30;
    game.ui.stateManager.setVar("current_money", game.current_money);
    game.upgradeset.check_affordability(game);
    expect(game.upgradeset.isUpgradeAvailable("ceramic_composite")).toBe(false);
  });

  it("rejects purchase when upgrade is at max level", () => {
    game.bypass_tech_tree_restrictions = true;
    const upgrade = game.upgradeset.getUpgrade("heat_control_operator");
    expect(upgrade.max_level).toBe(1);
    upgrade.setLevel(1);
    upgrade.updateDisplayCost();
    expect(upgrade.display_cost).toBe("MAX");
    game.current_money = 1e30;
    game.ui.stateManager.setVar("current_money", game.current_money);
    game.upgradeset.check_affordability(game);
    expect(game.upgradeset.purchaseUpgrade("heat_control_operator")).toBe(false);
    expect(upgrade.level).toBe(1);
  });

  it("clears tech tree on respec without resetting levels in single-tree mode", () => {
    const r = performTestRespec(game);
    expect(r.purchased).toBe(true);
    expect(r.respecOk).toBe(true);
    expect(r.techTreeAfter).toBe(null);
    expect(r.exclusiveLevelAfter).toBe(1);
  });

  it("shared tree upgrades map to the unified tree only", () => {
    game.bypass_tech_tree_restrictions = false;
    game.tech_tree = "unified";
    game.upgradeset.check_affordability(game);
    const sharedId = "chronometer";
    expect(game.upgradeset.upgradeToTechTreeMap.get(sharedId).size).toBe(1);
    expect(game.upgradeset.isUpgradeDoctrineLocked(sharedId)).toBe(false);
    expect(game.upgradeset.isUpgradeAvailable(sharedId)).toBe(true);
  });

  it("allows cross-doctrine purchasing when bypass is enabled", () => {
    game.bypass_tech_tree_restrictions = true;
    game.tech_tree = "unified";

    const architectUpgradeId = "heat_control_operator";
    const engineerUpgradeId = "stirling_generators";
    const arch = game.upgradeset.getUpgrade(architectUpgradeId);
    const eng = game.upgradeset.getUpgrade(engineerUpgradeId);
    arch.setLevel(0);
    eng.setLevel(0);
    arch.updateDisplayCost();
    eng.updateDisplayCost();
    const cArch = toNum(arch.getCost());
    const cEng = toNum(eng.getCost());
    const total = cArch + cEng;
    game.current_money = total;
    game.ui.stateManager.setVar("current_money", game.current_money);
    game.upgradeset.check_affordability(game);

    expect(game.upgradeset.isUpgradeAvailable(architectUpgradeId)).toBe(true);
    expect(game.upgradeset.isUpgradeAvailable(engineerUpgradeId)).toBe(true);
    expect(game.upgradeset.purchaseUpgrade(architectUpgradeId)).toBe(true);
    expect(game.upgradeset.getUpgrade(architectUpgradeId).level).toBe(1);
    expect(toNum(game.current_money)).toBe(cEng);
    game.upgradeset.check_affordability(game);
    expect(game.upgradeset.purchaseUpgrade(engineerUpgradeId)).toBe(true);
    expect(game.upgradeset.getUpgrade(engineerUpgradeId).level).toBe(1);
    expect(toNum(game.current_money)).toBe(0);
    expect(toNum(game.ui.stateManager.getVar("current_money"))).toBe(0);
  });

  it("respec doctrine fails without enough EP and succeeds with exact cost", () => {
    game.bypass_tech_tree_restrictions = false;
    game.tech_tree = "unified";
    game.current_exotic_particles = 0;
    game.ui.stateManager.setVar("current_exotic_particles", 0);

    expect(game.respecDoctrine()).toBe(false);
    expect(game.tech_tree).toBe("unified");

    game.current_exotic_particles = game.RESPER_DOCTRINE_EP_COST;
    game.ui.stateManager.setVar("current_exotic_particles", game.current_exotic_particles);

    expect(game.respecDoctrine()).toBe(true);
    expect(game.tech_tree).toBe(null);
    expect(toNum(game.current_exotic_particles)).toBe(0);
    expect(toNum(game.ui.stateManager.getVar("current_exotic_particles"))).toBe(0);
  });
});
