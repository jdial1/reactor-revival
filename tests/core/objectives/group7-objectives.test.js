import { describe, it, expect, beforeEach, vi, setupGame, toNum } from "../../helpers/setup.js";
import { CHAPTER_COMPLETION_OBJECTIVE_INDICES, INFINITE_POWER_STEP } from "@app/logic.js";

describe("Group 7: Objective & Tutorial Progression", () => {
  let game;

  beforeEach(async () => {
    game = await setupGame();
  });

  it("locks infinite power objective additive scaling", () => {
    const om = game.objectives_manager;
    om._infiniteChallengeIndex = 0;
    const firstObj = om.generateInfiniteObjective();
    const firstTarget = firstObj.target;

    om._lastInfinitePowerTarget = firstTarget;
    om._infiniteChallengeIndex = 0;
    const secondObj = om.generateInfiniteObjective();

    expect(firstObj.checkId).toBe("infinitePower");
    expect(secondObj.checkId).toBe("infinitePower");
    expect(secondObj.target).toBe(firstTarget + INFINITE_POWER_STEP);
  });

  it("locks infinite money objective multiplicative scaling", () => {
    const om = game.objectives_manager;
    om._infiniteChallengeIndex = 2;
    const firstObj = om.generateInfiniteObjective();
    const firstTarget = firstObj.target;

    om._lastInfiniteMoneyThorium = firstTarget;
    om._infiniteChallengeIndex = 2;
    const secondObj = om.generateInfiniteObjective();

    expect(firstObj.checkId).toBe("infiniteMoneyThorium");
    expect(secondObj.target).toBe(firstTarget * 2);
  });

  it("locks objective reward grant against double firing while claiming", () => {
    const om = game.objectives_manager;
    const reward = 321;
    const beforeMoney = toNum(game.state.current_money);

    om.current_objective_def = { checkId: "manualReward", completed: true, reward };
    om.current_objective_index = 0;
    vi.spyOn(om, "set_objective").mockImplementation(() => {});

    om.claimObjective();
    om.claimObjective();

    const afterMoney = toNum(game.state.current_money);
    expect(afterMoney - beforeMoney).toBe(reward);
  });

  it("locks chapter completion objective auto-complete once chapter prerequisites are done", () => {
    const om = game.objectives_manager;
    const chapterCompletionIndex = CHAPTER_COMPLETION_OBJECTIVE_INDICES[0];

    for (let i = 0; i < chapterCompletionIndex; i++) {
      if (om.objectives_data[i]) {
        om.objectives_data[i].completed = true;
      }
    }

    om.set_objective(chapterCompletionIndex, true);

    expect(om.current_objective_def.isChapterCompletion).toBe(true);
    expect(om.current_objective_def.completed).toBe(true);
    expect(om.objectives_data[chapterCompletionIndex].completed).toBe(true);
  });
});
