import { describe, it, expect, beforeEach, setupGame, toNum } from "../helpers/setup.js";
import { placePart } from "../helpers/gameHelpers.js";
import { BALANCE } from "../../public/src/logic.js";
import { HEAT_TRANSFER_DIFF_DIVISOR, VALVE_TOPUP_THRESHOLD } from "../../public/src/utils.js";

function f32(x) {
  const a = new Float32Array(1);
  a[0] = x;
  return a[0];
}

function prepTick(game) {
  game.reactor.updateStats();
  game.engine._updatePartCaches();
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
  const maxTransfer = f32(Math.min(f32(valveRate), f32(f32(ventCap) * BALANCE.valveTopupCapRatio)));
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

function exchangerPullFromHotNeighbor(hotHeat, exchHeat, transferVal) {
  const diff = f32(f32(hotHeat) - f32(exchHeat));
  return Math.min(
    f32(transferVal),
    Math.ceil(f32(diff) / HEAT_TRANSFER_DIFF_DIVISOR),
    f32(hotHeat)
  );
}

function snapThree(hotTile, exchTile, coolTile) {
  return {
    hot: f32(hotTile.heat_contained),
    exch: f32(exchTile.heat_contained),
    cool: f32(coolTile.heat_contained),
  };
}

describe("Group 2: Thermodynamics & Heat Transfer", () => {
  let game;

  beforeEach(async () => {
    game = await setupGame();
    game.tileset.clearAllTiles();
  });

  it("locks exchanger single-tick pull from hotter neighbor with exact heat", async () => {
    const hot = await placePart(game, 5, 5, "coolant_cell1");
    const exch = await placePart(game, 5, 6, "heat_exchanger1");
    const cool = await placePart(game, 5, 7, "coolant_cell1");

    const startHot = 1200;
    hot.heat_contained = startHot;
    exch.heat_contained = 0;
    cool.heat_contained = 0;

    const tv = exch.getEffectiveTransferValue();
    const pull = exchangerPullFromHotNeighbor(startHot, 0, tv);

    prepTick(game);
    game.engine.tick();

    expect(toNum(hot.heat_contained)).toBe(f32(f32(startHot) - f32(pull)));
    expect(toNum(exch.heat_contained)).toBe(f32(pull));
    expect(toNum(cool.heat_contained)).toBe(0);

    const total = f32(f32(f32(hot.heat_contained) + f32(exch.heat_contained)) + f32(cool.heat_contained));
    expect(total).toBe(f32(startHot));
  });

  it("locks exchanger redistribution over two ticks with exact total heat", async () => {
    const hot = await placePart(game, 5, 5, "coolant_cell1");
    const exchanger = await placePart(game, 5, 6, "heat_exchanger1");
    const cool = await placePart(game, 5, 7, "coolant_cell1");

    const startHot = 1200;
    hot.heat_contained = startHot;
    exchanger.heat_contained = 0;
    cool.heat_contained = 0;

    const totalBefore = f32(f32(f32(hot.heat_contained) + f32(exchanger.heat_contained)) + f32(cool.heat_contained));

    prepTick(game);
    game.engine.heatManager.processTick(1);
    game.engine.heatManager.processTick(1);
    const fromHeatSystem = snapThree(hot, exchanger, cool);

    hot.heat_contained = startHot;
    exchanger.heat_contained = 0;
    cool.heat_contained = 0;

    prepTick(game);
    game.engine.tick();
    game.engine.tick();

    const totalAfter = f32(f32(f32(hot.heat_contained) + f32(exchanger.heat_contained)) + f32(cool.heat_contained));
    const fromFullTick = snapThree(hot, exchanger, cool);

    expect(totalAfter).toBe(totalBefore);
    expect(fromFullTick.hot).toBe(fromHeatSystem.hot);
    expect(fromFullTick.exch).toBe(fromHeatSystem.exch);
    expect(fromFullTick.cool).toBe(fromHeatSystem.cool);
    expect(f32(f32(f32(fromFullTick.hot) + f32(fromFullTick.exch)) + f32(fromFullTick.cool))).toBe(f32(startHot));
  });

  it("locks coolant to check valve to vent chain with exact post-tick heat", async () => {
    const coolant = await placePart(game, 8, 0, "coolant_cell1");
    const valve = await placePart(game, 8, 1, "check_valve");
    const vent = await placePart(game, 8, 2, "vent1");

    coolant.heat_contained = f32(f32(coolant.part.containment) * 0.5);
    valve.heat_contained = 0;
    vent.heat_contained = 0;

    const valveRate = valve.getEffectiveTransferValue();
    const ventRate = vent.getEffectiveVentValue();
    const ventCap = vent.part.containment;
    const transferExpected = overflowTransferAmount(valveRate, coolant.heat_contained, 0, ventCap);
    const exp = expectedOverflowVentChain(coolant.heat_contained, valveRate, 0, ventCap, ventRate);

    expect(exp.transfer).toBe(transferExpected);

    prepTick(game);
    game.engine.tick();

    expect(toNum(valve.heat_contained)).toBe(0);
    expect(toNum(coolant.heat_contained)).toBe(exp.sourceAfter);
    expect(toNum(vent.heat_contained)).toBe(exp.ventAfter);
  });

  it("locks coolant to overflow valve to vent chain with exact post-tick heat", async () => {
    const coolant = await placePart(game, 0, 0, "coolant_cell1");
    const valve = await placePart(game, 0, 1, "overflow_valve");
    const vent = await placePart(game, 0, 2, "vent1");

    const cap = coolant.part.containment;
    coolant.heat_contained = f32(cap * 0.9);
    valve.heat_contained = 0;
    vent.heat_contained = 0;

    const valveRate = valve.getEffectiveTransferValue();
    const ventRate = vent.getEffectiveVentValue();
    const ventCap = vent.part.containment;
    const transferExpected = overflowTransferAmount(valveRate, coolant.heat_contained, 0, ventCap);
    const exp = expectedOverflowVentChain(coolant.heat_contained, valveRate, 0, ventCap, ventRate);

    expect(exp.transfer).toBe(transferExpected);

    prepTick(game);
    game.engine.tick();

    expect(toNum(valve.heat_contained)).toBe(0);
    expect(toNum(coolant.heat_contained)).toBe(exp.sourceAfter);
    expect(toNum(vent.heat_contained)).toBe(exp.ventAfter);
  });

  it("locks vent to remove exactly its effective vent rate per tick", async () => {
    const vent = await placePart(game, 4, 4, "vent1");
    const ventRate = vent.getEffectiveVentValue();
    const initialHeat = f32(f32(ventRate) * 3);

    vent.heat_contained = initialHeat;

    prepTick(game);
    game.engine.tick();

    expect(toNum(vent.heat_contained)).toBe(f32(f32(initialHeat) - f32(ventRate)));
  });

  it("locks vent clamping to zero when heat is below vent rate", async () => {
    const vent = await placePart(game, 4, 4, "vent1");
    const ventRate = vent.getEffectiveVentValue();
    const initialHeat = f32(f32(ventRate) / 4);

    vent.heat_contained = initialHeat;

    prepTick(game);
    game.engine.tick();

    expect(toNum(vent.heat_contained)).toBe(0);
  });

  it("locks overflow valve below 80% input ratio with no transfer", async () => {
    const source = await placePart(game, 6, 5, "coolant_cell1");
    const valve = await placePart(game, 6, 6, "overflow_valve");
    const sink = await placePart(game, 6, 7, "vent1");

    const capacity = source.part.containment;
    source.heat_contained = f32(f32(capacity) * 0.7999);
    valve.heat_contained = 0;
    sink.heat_contained = 0;

    const beforeIn = toNum(source.heat_contained);
    const beforeOut = toNum(sink.heat_contained);

    prepTick(game);
    game.engine.tick();

    expect(toNum(source.heat_contained)).toBe(beforeIn);
    expect(toNum(sink.heat_contained)).toBe(beforeOut);
    expect(toNum(valve.heat_contained)).toBe(0);
  });

  it("locks overflow valve at exactly 80% input ratio allowing transfer", async () => {
    const source = await placePart(game, 6, 5, "coolant_cell1");
    const valve = await placePart(game, 6, 6, "overflow_valve");
    const sink = await placePart(game, 6, 7, "vent1");

    const capacity = source.part.containment;
    source.heat_contained = f32(f32(capacity) * 0.8);
    valve.heat_contained = 0;
    sink.heat_contained = 0;

    const valveRate = valve.getEffectiveTransferValue();
    const ventRate = sink.getEffectiveVentValue();
    const ventCap = sink.part.containment;
    const transferExpected = overflowTransferAmount(valveRate, source.heat_contained, 0, ventCap);
    const exp = expectedOverflowVentChain(source.heat_contained, valveRate, 0, ventCap, ventRate);

    expect(exp.transfer).toBe(transferExpected);
    expect(transferExpected).toBe(f32(sink.part.containment));

    prepTick(game);
    game.engine.tick();

    expect(toNum(valve.heat_contained)).toBe(0);
    expect(toNum(source.heat_contained)).toBe(exp.sourceAfter);
    expect(toNum(sink.heat_contained)).toBe(exp.ventAfter);
  });

  it("locks overflow valve above 80% input ratio with exact post-tick heat", async () => {
    const source = await placePart(game, 6, 5, "coolant_cell1");
    const valve = await placePart(game, 6, 6, "overflow_valve");
    const sink = await placePart(game, 6, 7, "vent1");

    const capacity = source.part.containment;
    source.heat_contained = f32(f32(capacity) * 0.9001);
    valve.heat_contained = 0;
    sink.heat_contained = 0;

    const valveRate = valve.getEffectiveTransferValue();
    const ventRate = sink.getEffectiveVentValue();
    const ventCap = sink.part.containment;
    const transferExpected = overflowTransferAmount(valveRate, source.heat_contained, 0, ventCap);
    const exp = expectedOverflowVentChain(source.heat_contained, valveRate, 0, ventCap, ventRate);

    expect(exp.transfer).toBe(transferExpected);

    prepTick(game);
    game.engine.tick();

    expect(toNum(valve.heat_contained)).toBe(0);
    expect(toNum(source.heat_contained)).toBe(exp.sourceAfter);
    expect(toNum(sink.heat_contained)).toBe(exp.ventAfter);
  });

  it("locks top-up valve when output above 20% with no transfer", async () => {
    const source = await placePart(game, 7, 5, "coolant_cell1");
    const valve = await placePart(game, 7, 6, "topup_valve");
    const output = await placePart(game, 7, 7, "vent1");

    const outputCapacity = output.part.containment;
    source.heat_contained = f32(source.part.containment * 0.95);
    valve.heat_contained = 0;
    output.heat_contained = f32(f32(outputCapacity) * 0.2001);

    const beforeOut = f32(output.heat_contained);
    const beforeIn = f32(source.heat_contained);
    const ventRate = output.getEffectiveVentValue();
    const expectedOutOnlyVent = f32(f32(beforeOut) - Math.min(f32(ventRate), f32(beforeOut)));

    prepTick(game);
    game.engine.tick();

    expect(toNum(source.heat_contained)).toBe(beforeIn);
    expect(toNum(output.heat_contained)).toBe(expectedOutOnlyVent);
    expect(toNum(valve.heat_contained)).toBe(0);
  });

  it("locks top-up valve at exactly 20% output ratio allowing transfer", async () => {
    const source = await placePart(game, 7, 5, "coolant_cell1");
    const valve = await placePart(game, 7, 6, "topup_valve");
    const output = await placePart(game, 7, 7, "vent1");

    const outputCapacity = output.part.containment;
    source.heat_contained = f32(source.part.containment * 0.95);
    valve.heat_contained = 0;
    output.heat_contained = f32(f32(outputCapacity) * VALVE_TOPUP_THRESHOLD);

    const valveRate = valve.getEffectiveTransferValue();
    const ventRate = output.getEffectiveVentValue();
    const transferExpected = topupTransferAmount(valveRate, source.heat_contained, output.heat_contained, outputCapacity);
    const exp = expectedTopupVentChain(source.heat_contained, valveRate, output.heat_contained, outputCapacity, ventRate);

    expect(f32(f32(toNum(output.heat_contained)) / f32(outputCapacity))).toBe(f32(VALVE_TOPUP_THRESHOLD));
    expect(exp.transfer).toBe(transferExpected);
    expect(transferExpected).toBe(f32(f32(outputCapacity) * BALANCE.valveTopupCapRatio));

    prepTick(game);
    game.engine.tick();

    expect(toNum(valve.heat_contained)).toBe(0);
    expect(toNum(source.heat_contained)).toBe(exp.sourceAfter);
    expect(toNum(output.heat_contained)).toBe(exp.ventAfter);
  });

  it("locks top-up valve when output below 20% with exact post-tick heat", async () => {
    const source = await placePart(game, 7, 5, "coolant_cell1");
    const valve = await placePart(game, 7, 6, "topup_valve");
    const output = await placePart(game, 7, 7, "vent1");

    const outputCapacity = output.part.containment;
    source.heat_contained = f32(source.part.containment * 0.95);
    valve.heat_contained = 0;
    output.heat_contained = f32(f32(outputCapacity) * 0.1);

    const valveRate = valve.getEffectiveTransferValue();
    const ventRate = output.getEffectiveVentValue();
    const transferExpected = topupTransferAmount(valveRate, source.heat_contained, output.heat_contained, outputCapacity);
    const exp = expectedTopupVentChain(source.heat_contained, valveRate, output.heat_contained, outputCapacity, ventRate);

    expect(exp.transfer).toBe(transferExpected);
    expect(transferExpected).toBe(f32(f32(outputCapacity) * BALANCE.valveTopupCapRatio));

    prepTick(game);
    game.engine.tick();

    expect(toNum(valve.heat_contained)).toBe(0);
    expect(toNum(source.heat_contained)).toBe(exp.sourceAfter);
    expect(toNum(output.heat_contained)).toBe(exp.ventAfter);
  });

  it("locks meltdown boundary to strictly greater than 2x max heat", () => {
    game.paused = false;
    const at2x = game.reactor.max_heat.mul(2);
    game.reactor.current_heat = at2x;
    game.engine.tick();
    expect(game.reactor.has_melted_down).toBe(false);
    expect(toNum(game.reactor.current_heat)).toBe(toNum(at2x));

    game.reactor.current_heat = game.reactor.max_heat.mul(2).add(1);
    game.engine.tick();
    expect(game.reactor.has_melted_down).toBe(true);
  });

  it("locks meltdown at 2.1x max heat same as minimal over-2x", () => {
    game.paused = false;
    const h = game.reactor.max_heat.mul(2.1);
    game.reactor.current_heat = h;
    game.engine.tick();
    expect(game.reactor.has_melted_down).toBe(true);
    expect(toNum(game.reactor.current_heat)).toBe(toNum(h));
  });
});
