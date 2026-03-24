import { describe, it, expect, beforeEach, setupGame, toNum } from "../helpers/setup.js";
import { BlueprintService } from "../../public/src/logic.js";
import { calculateLayoutCostBreakdown, deserializeReactor } from "../../public/src/components/ui-components.js";

describe("Group 8: Copy/Paste & Blueprint Mechanics", () => {
  let game;
  let bp;

  beforeEach(async () => {
    game = await setupGame();
    bp = new BlueprintService(game);
  });

  it("locks invalid blueprint JSON deserialization to null", () => {
    expect(deserializeReactor("{ this is invalid json")).toBeNull();
    expect(bp.deserialize("{ this is invalid json")).toBeNull();
  });

  it("locks layout cost breakdown split between money and EP requirements", () => {
    const moneyPart = game.partset.partsArray.find((part) => !part.erequires);
    const epPart = game.partset.partsArray.find((part) => !!part.erequires);
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
    game.ui.stateManager.setVar("current_money", unitCost);
    const beforeMoney = toNum(game.current_money);

    const layout = [[
      { id: "uranium1", t: "uranium", lvl: 1 },
      { id: "uranium1", t: "uranium", lvl: 1 },
      { id: "uranium1", t: "uranium", lvl: 1 },
    ]];

    const affordable = bp.buildAffordableLayout(layout, 0);

    expect(affordable[0][0]).not.toBeNull();
    expect(affordable[0][1]).toBeNull();
    expect(affordable[0][2]).toBeNull();
    expect(toNum(game.current_money)).toBe(beforeMoney);
    expect(toNum(game.current_money)).toBeGreaterThanOrEqual(0);
  });
});
