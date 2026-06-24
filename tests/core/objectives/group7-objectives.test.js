import { describe, it, expect, beforeEach, vi, setupGame, toNum } from "../../helpers/setup.js";
import { CHAPTER_COMPLETION_OBJECTIVE_INDICES } from "@app/logic.js";

describe("Group 7: Objective & Tutorial Progression", () => {
  let game;

  beforeEach(async () => {
    game = await setupGame();
  });

  it("loads the all-completed objective after the final chapter objective", () => {
    const om = game.objectives_manager;
    const lastIndex = om.objectives_data.length - 1;
    for (let i = 0; i < lastIndex; i++) {
      if (om.objectives_data[i]) om.objectives_data[i].completed = true;
    }
    om.set_objective(lastIndex, true);
    expect(om.current_objective_def.checkId).toBe("allObjectives");
    expect(om.current_objective_def.title).toContain("All objectives completed");
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
