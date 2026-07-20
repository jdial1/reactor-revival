import { describe, it, expect, beforeEach } from "vitest";
import {
  setupSessionOnly,
  hasMeltedDown,
  componentTicksAt,
  setSessionReactorHeat,
  reactorMaxHeat,
} from "../../helpers/sessionHelpers.js";

function place(session, row, col, id) {
  expect(session.placeComponent(row, col, id)).toBe(true);
}

function money(session) {
  return Number(session.getSnapshot().economy?.money ?? 0);
}

function slotId(session, row, col) {
  const snap = session.getSnapshot();
  return snap.grid.slots[row * snap.grid.cols + col]?.id ?? null;
}

describe("Complex Layouts (session)", () => {
  let session;

  beforeEach(async () => {
    session = await setupSessionOnly({ money: 1e30 });
  });

  it("transfers heat through a long exchanger chain without meltdown", () => {
    place(session, 5, 5, "uranium1");
    for (let i = 0; i < 5; i++) place(session, 5, 6 + i, "heat_exchanger1");
    place(session, 5, 11, "vent1");

    session.tick();
    expect(hasMeltedDown(session)).toBe(false);
    expect(slotId(session, 5, 5)).toBe("uranium1");
    expect(componentTicksAt(session, 5, 5)).toBeGreaterThan(0);

    for (let i = 0; i < 10; i++) session.tick();

    expect(hasMeltedDown(session)).toBe(false);
    expect(slotId(session, 5, 5)).toBe("uranium1");
    expect(componentTicksAt(session, 5, 5)).toBeGreaterThan(0);
  });

  it("keeps cell pulse power at base_power under forceful fusion high heat", () => {
    expect(session.purchaseUpgrade("forceful_fusion")).toBe(true);
    expect(session.modifiers?.heatPowerMultiplier).toBe(1);

    place(session, 5, 5, "uranium1");
    session.grid.maxHeat = 100000;
    setSessionReactorHeat(session, 10000);
    expect(reactorMaxHeat(session)).toBe(100000);

    const part = session.getPart("uranium1");
    const out = session.getCellOutputAt(5, 5);
    expect(out.power).toBeCloseTo(Number(part.basePower ?? part.base_power), 1);
  });

  it("protium depletes into particles and reports base_power times M+N pulse", () => {
    session.setUpgradeLevels([
      { id: "laboratory", level: 1 },
      { id: "protium_cells", level: 1 },
    ]);

    place(session, 0, 0, "protium1");
    const part = session.getPart("protium1");
    session.grid.getComponentAt(0, 0).ticks = 1;
    session.tick();

    expect(slotId(session, 0, 0)).toBeNull();
    expect(Number(session.getSnapshot().economy?.protiumParticles ?? 0)).toBe(
      Number(part.cellCount ?? part.cell_count ?? 1)
    );

    place(session, 1, 0, "protium1");
    const out = session.getCellOutputAt(1, 0);
    const M = Number(part.cellMultiplier ?? part.cell_pack_M ?? 1);
    const N = Number(out.pulseN ?? 0);
    const base = Number(part.basePower ?? part.base_power);
    expect(out.power).toBeCloseTo(base * (M + N), 1);
  });

  it("auto-buys a depleted perpetual uranium cell in the same tick", async () => {
    const local = await setupSessionOnly();
    local.creditMoney(1e6);
    expect(local.purchaseUpgrade("uranium1_cell_perpetual")).toBe(true);
    local.toggles.auto_buy = true;

    place(local, 0, 0, "uranium1");
    const part = local.getPart("uranium1");
    expect(part.perpetual).toBe(true);

    const before = money(local);
    local.grid.getComponentAt(0, 0).ticks = 1;
    local.tick();

    expect(slotId(local, 0, 0)).toBe("uranium1");
    expect(componentTicksAt(local, 0, 0)).toBe(Number(part.baseTicks ?? part.base_ticks));
    expect(money(local)).toBeLessThan(before);
  });
});
