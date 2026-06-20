import { describe, it, expect, beforeEach, setupGame, toNum, getPartByCriteria } from "../../helpers/setup.js";
import { patchGameState } from "@app/state.js";
import { calculateLayoutCostBreakdown, deserializeReactor, buildAffordableLayout } from "@app/components/ui-components.js";

describe("Group 8: Copy/Paste & Blueprint Mechanics", () => {
  let game;

  beforeEach(async () => {
    game = await setupGame();
  });

  it("locks invalid blueprint JSON deserialization to null", () => {
    expect(deserializeReactor("{ this is invalid json")).toBeNull();
  });

  it("locks layout cost breakdown split between money and EP requirements", () => {
    const moneyPart = getPartByCriteria(game.partset, { requiresEp: false });
    const epPart = getPartByCriteria(game.partset, { requiresEp: true });
    expect(moneyPart).toBeDefined();
    expect(epPart).toBeDefined();

    const layout = [[
      { id: moneyPart.id, lvl: 1, t: moneyPart.type },
      { id: epPart.id, lvl: 1, t: epPart.type },
    ]];
    const breakdown = calculateLayoutCostBreakdown(game.partset, layout);

    expect(breakdown.money).toBeGreaterThan(0);
    expect(breakdown.ep).toBeGreaterThan(0);
  });

  it("locks strict top-left to bottom-right affordability during partial paste", () => {
    const uranium = game.partset.getPartById("uranium1");
    const unitCost = toNum(uranium.cost);

    game.current_money = unitCost;
    patchGameState(game, { current_money: unitCost });
    const beforeMoney = toNum(game.current_money);

    const layout = [[
      { id: "uranium1", t: "uranium", lvl: 1 },
      { id: "uranium1", t: "uranium", lvl: 1 },
      { id: "uranium1", t: "uranium", lvl: 1 },
    ]];

    const affordable = buildAffordableLayout(layout, 0, game.rows, game.cols, game);

    expect(affordable[0][0]).not.toBeNull();
    expect(affordable[0][1]).toBeNull();
    expect(affordable[0][2]).toBeNull();
    expect(toNum(game.current_money)).toBe(beforeMoney);
    expect(toNum(game.current_money)).toBeGreaterThanOrEqual(0);
  });
});
