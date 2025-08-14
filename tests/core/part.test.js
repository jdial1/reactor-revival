import { describe, it, expect, beforeEach, setupGame } from "../helpers/setup.js";

describe("Part Mechanics", () => {
  let game;

  beforeEach(async () => {
    game = await setupGame();
  });

  it("should have correct initial stats", () => {
    const part = game.partset.getPartById("uranium1");
    expect(part).toBeDefined();
    expect(part.power).toBe(part.base_power);
    expect(part.heat).toBe(part.base_heat);
    expect(part.ticks).toBe(part.base_ticks);
    expect(part.cost).toBe(part.base_cost);
  });

  it("should calculate cell power correctly", () => {
    const part = game.partset.getPartById("uranium1");
    expect(part).toBeDefined();
    const power = part.power;
    expect(power).toBe(part.base_power);
  });

  it("should calculate cell heat correctly", () => {
    const part = game.partset.getPartById("uranium1");
    expect(part).toBeDefined();
    const heat = part.heat;
    expect(heat).toBe(part.base_heat);
  });

  it("should calculate cell ticks correctly", () => {
    const part = game.partset.getPartById("uranium1");
    expect(part).toBeDefined();
    const ticks = part.ticks;
    expect(ticks).toBe(part.base_ticks);
  });

  it("should calculate vent value correctly", () => {
    const part = game.partset.getPartById("vent1");
    expect(part).toBeDefined();
    const vent = part.vent;
    expect(vent).toBe(part.base_vent);
  });

  it("should calculate capacitor value correctly", () => {
    const part = game.partset.getPartById("capacitor1");
    expect(part).toBeDefined();
    const reactor_power = part.reactor_power;
    expect(reactor_power).toBe(part.base_reactor_power);
  });

  it("should calculate particle accelerator value correctly", () => {
    const part = game.partset.getPartById("particle_accelerator1");
    expect(part).toBeDefined();
    const ep_heat = part.ep_heat;
    expect(ep_heat).toBe(part.base_ep_heat);
  });

  it("should calculate part cost correctly", () => {
    const part = game.partset.getPartById("uranium1");
    expect(part).toBeDefined();
    const cost = part.cost;
    expect(cost).toBe(part.base_cost);
  });

  it("should calculate part ecost correctly", () => {
    const part = game.partset.getPartById("uranium1");
    expect(part).toBeDefined();
    const ecost = part.ecost;
    expect(ecost).toBe(part.base_ecost);
  });

  it("should calculate part level correctly", () => {
    const part = game.partset.getPartById("uranium1");
    expect(part).toBeDefined();
    const level = part.level;
    expect(level).toBe(part.part.level);
  });

  it("should calculate part category correctly", () => {
    const part = game.partset.getPartById("uranium1");
    expect(part).toBeDefined();
    const category = part.category;
    expect(category).toBe(part.part.category);
  });

  it("should calculate part type correctly", () => {
    const part = game.partset.getPartById("uranium1");
    expect(part).toBeDefined();
    const type = part.type;
    expect(type).toBe(part.part.type);
  });

  it("should calculate part perpetual status correctly", () => {
    const part = game.partset.getPartById("uranium1");
    expect(part).toBeDefined();
    const perpetual = part.perpetual;
    expect(perpetual).toBe(false);
  });

  it("should have its stats recalculated based on upgrades", () => {
    const part = game.partset.getPartById("reflector1");
    const initialTicks = part.ticks;

    const upgrade = game.upgradeset.getUpgrade("improved_reflector_density");
    game.current_money = upgrade.base_cost;
    game.upgradeset.purchaseUpgrade(upgrade.id);

    // In the real app, this is called by the upgrade action. We call it manually here to test the Part class.
    part.recalculate_stats();

    expect(part.ticks).toBeGreaterThan(initialTicks);
  });

  it("should generate the correct image path for a multi-level part", () => {
    const part = game.partset.getPartById("capacitor3");
    expect(part.getImagePath()).toBe("img/parts/capacitors/capacitor_3.png");
  });

  it("should generate the correct image path for a cell", () => {
    const part = game.partset.getPartById("plutonium2");
    expect(part.getImagePath()).toBe("img/parts/cells/cell_2_2.png");
  });

  it("should generate a descriptive text", () => {
    const part = game.partset.getPartById("uranium1");
    part.updateDescription();
    expect(part.description).toContain("Creates");
    expect(part.description).toContain("power and");
    expect(part.description).toContain("heat for");
    expect(part.description).toContain("ticks.");
  });

  it("should be affordable if player has enough money", () => {
    const part = game.partset.getPartById("uranium1");
    game.current_money = part.cost + 1;
    game.partset.check_affordability(game);
    expect(part.affordable).toBe(true);
  });

  it("should not be affordable if player has insufficient money", () => {
    const part = game.partset.getPartById("uranium1");
    game.current_money = part.cost - 1;
    game.partset.check_affordability(game);
    expect(part.affordable).toBe(false);
  });
});
