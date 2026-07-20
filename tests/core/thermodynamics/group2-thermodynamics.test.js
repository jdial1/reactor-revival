import { describe, it, expect, beforeEach } from "vitest";
import {
  setupSessionOnly,
  setSessionTileHeat,
  tileHeatAt,
} from "../../helpers/sessionHelpers.js";
import { HEAT_TRANSFER_DIFF_DIVISOR, VALVE_TOPUP_THRESHOLD } from "@app/constants/sim.js";

function f32(x) {
  const a = new Float32Array(1);
  a[0] = x;
  return a[0];
}

function overflowTransferAmount(valveRate, initialSource, ventStart, ventCap) {
  const outputSpace = Math.max(0, f32(f32(ventCap) - f32(ventStart)));
  return f32(Math.min(f32(valveRate), f32(initialSource), outputSpace));
}

function expectedOverflowVentChain(initialSource, valveRate, ventStart, ventCap, ventVentRate) {
  const transfer = overflowTransferAmount(valveRate, initialSource, ventStart, ventCap);
  const sourceAfter = f32(f32(initialSource) - transfer);
  const afterValve = f32(f32(ventStart) + transfer);
  const ventReduce = Math.min(f32(ventVentRate), afterValve);
  const ventAfter = f32(afterValve - ventReduce);
  return { transfer, sourceAfter, ventAfter };
}

function topupTransferAmount(valveRate, initialSource, ventStart, ventCap) {
  const outputSpace = Math.max(0, f32(f32(ventCap) - f32(ventStart)));
  const maxTransfer = f32(Math.min(f32(valveRate), f32(f32(ventCap) * VALVE_TOPUP_THRESHOLD)));
  return f32(Math.min(maxTransfer, f32(initialSource), outputSpace));
}

function expectedTopupVentChain(initialSource, valveRate, ventStart, ventCap, ventVentRate) {
  const transfer = topupTransferAmount(valveRate, initialSource, ventStart, ventCap);
  const sourceAfter = f32(f32(initialSource) - transfer);
  const afterValve = f32(f32(ventStart) + transfer);
  const ventReduce = Math.min(f32(ventVentRate), afterValve);
  const ventAfter = f32(afterValve - ventReduce);
  return { transfer, sourceAfter, ventAfter };
}

function effectiveTransfer(session, partId) {
  return f32(session.resolveDisplayRates(partId)?.transfer ?? 0);
}

function effectiveVent(session, partId) {
  return f32(session.resolveDisplayRates(partId)?.vent ?? 0);
}

function containment(session, partId) {
  return f32(session.getPart(partId)?.containment ?? 0);
}

function exchangerPullFromHotNeighbor(hotHeat, exchHeat, transferVal) {
  const diff = f32(f32(hotHeat) - f32(exchHeat));
  return Math.min(
    f32(transferVal),
    Math.ceil(f32(diff) / HEAT_TRANSFER_DIFF_DIVISOR),
    f32(hotHeat)
  );
}

function place(session, row, col, id) {
  expect(session.placeComponent(row, col, id)).toBe(true);
}

describe("Group 2: Thermodynamics & Heat Transfer (session)", () => {
  let session;

  beforeEach(async () => {
    session = await setupSessionOnly();
  });

  it("locks exchanger single-tick pull from hotter neighbor with exact heat", () => {
    place(session, 5, 5, "coolant_cell1");
    place(session, 5, 6, "heat_exchanger1");
    place(session, 5, 7, "coolant_cell1");

    const startHot = 1200;
    setSessionTileHeat(session, 5, 5, startHot);
    setSessionTileHeat(session, 5, 6, 0);
    setSessionTileHeat(session, 5, 7, 0);

    const tv = effectiveTransfer(session, "heat_exchanger1");
    const pull = exchangerPullFromHotNeighbor(startHot, 0, tv);

    session.tick();

    expect(f32(tileHeatAt(session, 5, 5))).toBe(f32(f32(startHot) - f32(pull)));
    expect(f32(tileHeatAt(session, 5, 6))).toBe(f32(pull));
    expect(f32(tileHeatAt(session, 5, 7))).toBe(0);

    const total = f32(
      f32(f32(tileHeatAt(session, 5, 5)) + f32(tileHeatAt(session, 5, 6))) +
        f32(tileHeatAt(session, 5, 7))
    );
    expect(total).toBe(f32(startHot));
  });

  it("locks exchanger redistribution over two ticks with conserved total heat", () => {
    place(session, 5, 5, "coolant_cell1");
    place(session, 5, 6, "heat_exchanger1");
    place(session, 5, 7, "coolant_cell1");

    const startHot = 1200;
    setSessionTileHeat(session, 5, 5, startHot);
    setSessionTileHeat(session, 5, 6, 0);
    setSessionTileHeat(session, 5, 7, 0);

    session.tick();
    session.tick();

    const hot = f32(tileHeatAt(session, 5, 5));
    const exch = f32(tileHeatAt(session, 5, 6));
    const cool = f32(tileHeatAt(session, 5, 7));
    const total = f32(f32(f32(hot) + f32(exch)) + f32(cool));

    expect(total).toBe(f32(startHot));
    expect(hot).toBeLessThan(startHot);
    expect(f32(exch) + f32(cool)).toBeGreaterThan(0);
  });

  it("locks coolant to check valve to vent chain with exact post-tick heat", () => {
    place(session, 8, 0, "coolant_cell1");
    place(session, 8, 1, "check_valve");
    place(session, 8, 2, "vent1");

    const sourceStart = f32(f32(containment(session, "coolant_cell1")) * 0.5);
    setSessionTileHeat(session, 8, 0, sourceStart);
    setSessionTileHeat(session, 8, 1, 0);
    setSessionTileHeat(session, 8, 2, 0);

    const valveRate = effectiveTransfer(session, "check_valve");
    const ventRate = effectiveVent(session, "vent1");
    const ventCap = containment(session, "vent1");
    const transferExpected = overflowTransferAmount(valveRate, sourceStart, 0, ventCap);
    const exp = expectedOverflowVentChain(sourceStart, valveRate, 0, ventCap, ventRate);

    expect(exp.transfer).toBe(transferExpected);

    session.tick();

    expect(f32(tileHeatAt(session, 8, 1))).toBe(0);
    expect(f32(tileHeatAt(session, 8, 0))).toBe(exp.sourceAfter);
    expect(f32(tileHeatAt(session, 8, 2))).toBe(exp.ventAfter);
  });

  it("locks coolant to overflow valve to vent chain with exact post-tick heat", () => {
    place(session, 0, 0, "coolant_cell1");
    place(session, 0, 1, "overflow_valve");
    place(session, 0, 2, "vent1");

    const sourceStart = f32(containment(session, "coolant_cell1") * 0.9);
    setSessionTileHeat(session, 0, 0, sourceStart);
    setSessionTileHeat(session, 0, 1, 0);
    setSessionTileHeat(session, 0, 2, 0);

    const valveRate = effectiveTransfer(session, "overflow_valve");
    const ventRate = effectiveVent(session, "vent1");
    const ventCap = containment(session, "vent1");
    const transferExpected = overflowTransferAmount(valveRate, sourceStart, 0, ventCap);
    const exp = expectedOverflowVentChain(sourceStart, valveRate, 0, ventCap, ventRate);

    expect(exp.transfer).toBe(transferExpected);

    session.tick();

    expect(f32(tileHeatAt(session, 0, 1))).toBe(0);
    expect(f32(tileHeatAt(session, 0, 0))).toBe(exp.sourceAfter);
    expect(f32(tileHeatAt(session, 0, 2))).toBe(exp.ventAfter);
  });

  it("locks vent to remove exactly its effective vent rate per tick", () => {
    place(session, 4, 4, "vent1");
    const ventRate = effectiveVent(session, "vent1");
    const initialHeat = f32(f32(ventRate) * 3);

    setSessionTileHeat(session, 4, 4, initialHeat);
    session.tick();

    expect(f32(tileHeatAt(session, 4, 4))).toBe(f32(f32(initialHeat) - f32(ventRate)));
  });

  it("locks vent clamping to zero when heat is below vent rate", () => {
    place(session, 4, 4, "vent1");
    const ventRate = effectiveVent(session, "vent1");
    const initialHeat = f32(f32(ventRate) / 4);

    setSessionTileHeat(session, 4, 4, initialHeat);
    session.tick();

    expect(f32(tileHeatAt(session, 4, 4))).toBe(0);
  });

  it("locks overflow valve below 80% input ratio with no transfer", () => {
    place(session, 6, 5, "coolant_cell1");
    place(session, 6, 6, "overflow_valve");
    place(session, 6, 7, "vent1");

    const capacity = containment(session, "coolant_cell1");
    const beforeIn = f32(f32(capacity) * 0.7999);
    setSessionTileHeat(session, 6, 5, beforeIn);
    setSessionTileHeat(session, 6, 6, 0);
    setSessionTileHeat(session, 6, 7, 0);

    session.tick();

    expect(f32(tileHeatAt(session, 6, 5))).toBe(beforeIn);
    expect(f32(tileHeatAt(session, 6, 7))).toBe(0);
    expect(f32(tileHeatAt(session, 6, 6))).toBe(0);
  });

  it("locks overflow valve at exactly 80% input ratio allowing transfer", () => {
    place(session, 6, 5, "coolant_cell1");
    place(session, 6, 6, "overflow_valve");
    place(session, 6, 7, "vent1");

    const capacity = containment(session, "coolant_cell1");
    const sourceStart = f32(f32(capacity) * 0.8);
    setSessionTileHeat(session, 6, 5, sourceStart);
    setSessionTileHeat(session, 6, 6, 0);
    setSessionTileHeat(session, 6, 7, 0);

    const valveRate = effectiveTransfer(session, "overflow_valve");
    const ventRate = effectiveVent(session, "vent1");
    const ventCap = containment(session, "vent1");
    const transferExpected = overflowTransferAmount(valveRate, sourceStart, 0, ventCap);
    const exp = expectedOverflowVentChain(sourceStart, valveRate, 0, ventCap, ventRate);

    expect(exp.transfer).toBe(transferExpected);
    expect(transferExpected).toBe(ventCap);

    session.tick();

    expect(f32(tileHeatAt(session, 6, 6))).toBe(0);
    expect(f32(tileHeatAt(session, 6, 5))).toBe(exp.sourceAfter);
    expect(f32(tileHeatAt(session, 6, 7))).toBe(exp.ventAfter);
  });

  it("locks overflow valve above 80% input ratio with exact post-tick heat", () => {
    place(session, 6, 5, "coolant_cell1");
    place(session, 6, 6, "overflow_valve");
    place(session, 6, 7, "vent1");

    const capacity = containment(session, "coolant_cell1");
    const sourceStart = f32(f32(capacity) * 0.9001);
    setSessionTileHeat(session, 6, 5, sourceStart);
    setSessionTileHeat(session, 6, 6, 0);
    setSessionTileHeat(session, 6, 7, 0);

    const valveRate = effectiveTransfer(session, "overflow_valve");
    const ventRate = effectiveVent(session, "vent1");
    const ventCap = containment(session, "vent1");
    const transferExpected = overflowTransferAmount(valveRate, sourceStart, 0, ventCap);
    const exp = expectedOverflowVentChain(sourceStart, valveRate, 0, ventCap, ventRate);

    expect(exp.transfer).toBe(transferExpected);

    session.tick();

    expect(f32(tileHeatAt(session, 6, 6))).toBe(0);
    expect(f32(tileHeatAt(session, 6, 5))).toBe(exp.sourceAfter);
    expect(f32(tileHeatAt(session, 6, 7))).toBe(exp.ventAfter);
  });

  it("locks top-up valve when output above 20% with no transfer", () => {
    place(session, 7, 5, "coolant_cell1");
    place(session, 7, 6, "topup_valve");
    place(session, 7, 7, "vent1");

    const outputCapacity = containment(session, "vent1");
    const beforeIn = f32(containment(session, "coolant_cell1") * 0.95);
    const beforeOut = f32(f32(outputCapacity) * 0.2001);
    setSessionTileHeat(session, 7, 5, beforeIn);
    setSessionTileHeat(session, 7, 6, 0);
    setSessionTileHeat(session, 7, 7, beforeOut);

    const ventRate = effectiveVent(session, "vent1");
    const expectedOutOnlyVent = f32(f32(beforeOut) - Math.min(f32(ventRate), f32(beforeOut)));

    session.tick();

    expect(f32(tileHeatAt(session, 7, 5))).toBe(beforeIn);
    expect(f32(tileHeatAt(session, 7, 7))).toBe(expectedOutOnlyVent);
    expect(f32(tileHeatAt(session, 7, 6))).toBe(0);
  });

  it("locks top-up valve at exactly 20% output ratio allowing transfer", () => {
    place(session, 7, 5, "coolant_cell1");
    place(session, 7, 6, "topup_valve");
    place(session, 7, 7, "vent1");

    const outputCapacity = containment(session, "vent1");
    const sourceStart = f32(containment(session, "coolant_cell1") * 0.95);
    const outStart = f32(f32(outputCapacity) * VALVE_TOPUP_THRESHOLD);
    setSessionTileHeat(session, 7, 5, sourceStart);
    setSessionTileHeat(session, 7, 6, 0);
    setSessionTileHeat(session, 7, 7, outStart);

    const valveRate = effectiveTransfer(session, "topup_valve");
    const ventRate = effectiveVent(session, "vent1");
    const transferExpected = topupTransferAmount(valveRate, sourceStart, outStart, outputCapacity);
    const exp = expectedTopupVentChain(sourceStart, valveRate, outStart, outputCapacity, ventRate);

    expect(f32(f32(outStart) / f32(outputCapacity))).toBe(f32(VALVE_TOPUP_THRESHOLD));
    expect(exp.transfer).toBe(transferExpected);
    expect(transferExpected).toBe(f32(f32(outputCapacity) * VALVE_TOPUP_THRESHOLD));

    session.tick();

    expect(f32(tileHeatAt(session, 7, 6))).toBe(0);
    expect(f32(tileHeatAt(session, 7, 5))).toBe(exp.sourceAfter);
    expect(f32(tileHeatAt(session, 7, 7))).toBe(exp.ventAfter);
  });

  it("locks top-up valve when output below 20% with exact post-tick heat", () => {
    place(session, 7, 5, "coolant_cell1");
    place(session, 7, 6, "topup_valve");
    place(session, 7, 7, "vent1");

    const outputCapacity = containment(session, "vent1");
    const sourceStart = f32(containment(session, "coolant_cell1") * 0.95);
    const outStart = f32(f32(outputCapacity) * 0.1);
    setSessionTileHeat(session, 7, 5, sourceStart);
    setSessionTileHeat(session, 7, 6, 0);
    setSessionTileHeat(session, 7, 7, outStart);

    const valveRate = effectiveTransfer(session, "topup_valve");
    const ventRate = effectiveVent(session, "vent1");
    const transferExpected = topupTransferAmount(valveRate, sourceStart, outStart, outputCapacity);
    const exp = expectedTopupVentChain(sourceStart, valveRate, outStart, outputCapacity, ventRate);

    expect(exp.transfer).toBe(transferExpected);
    expect(transferExpected).toBe(f32(f32(outputCapacity) * VALVE_TOPUP_THRESHOLD));

    session.tick();

    expect(f32(tileHeatAt(session, 7, 6))).toBe(0);
    expect(f32(tileHeatAt(session, 7, 5))).toBe(exp.sourceAfter);
    expect(f32(tileHeatAt(session, 7, 7))).toBe(exp.ventAfter);
  });
});
