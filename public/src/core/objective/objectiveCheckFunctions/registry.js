import { PERCENT_COMPLETE_MAX } from "../objectiveConstants.js";
import { cellChecks } from "./cellChecks.js";
import { powerChecks } from "./powerChecks.js";
import { milestoneChecks } from "./milestoneChecks.js";
import { chapterChecks } from "./chapterChecks.js";
import { infiniteChecks } from "./infiniteChecks.js";

export const checkFunctions = Object.assign(
  {},
  cellChecks,
  powerChecks,
  milestoneChecks,
  chapterChecks,
  infiniteChecks
);

export function getObjectiveCheck(checkId) {
  const fn = checkFunctions[checkId];
  if (!fn) return null;
  return (game) => {
    const result = fn(game);
    if (typeof result === "boolean") {
      return { completed: result, percent: result ? PERCENT_COMPLETE_MAX : 0, text: result ? "Complete" : "Incomplete" };
    }
    return result;
  };
}
