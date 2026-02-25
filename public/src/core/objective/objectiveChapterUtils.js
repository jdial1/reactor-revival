import { PERCENT_COMPLETE_MAX } from "./objectiveConstants.js";

export function getChapterRange(startIndex, size) {
  return { start: startIndex, end: startIndex + size - 1 };
}

export function countCompletedInRange(objectives_data, startIndex, endIndex) {
  return objectives_data
    .slice(startIndex, endIndex)
    .reduce((count, obj) => (obj && !obj.isChapterCompletion && obj.completed ? count + 1 : count), 0);
}

export function countTotalInRange(objectives_data, startIndex, endIndex) {
  return objectives_data
    .slice(startIndex, endIndex)
    .reduce((count, obj) => (obj && !obj.isChapterCompletion ? count + 1 : count), 0);
}

export function isChapterComplete(game, start, end) {
  if (!game.objectives_manager?.objectives_data) return false;
  for (let i = start; i < end; i++) {
    const obj = game.objectives_manager.objectives_data[i];
    if (obj && !obj.isChapterCompletion && !obj.completed) return false;
  }
  return true;
}

export function checkChapterCompletion(objectives_data, startIndex, chapterSize) {
  if (!objectives_data || objectives_data.length === 0) {
    return { completed: false, text: "Loading...", percent: 0 };
  }
  const endIndex = Math.min(startIndex + chapterSize, objectives_data.length);
  const completedCount = countCompletedInRange(objectives_data, startIndex, endIndex);
  const totalObjectives = countTotalInRange(objectives_data, startIndex, endIndex);
  const percent = totalObjectives > 0 ? (completedCount / totalObjectives) * PERCENT_COMPLETE_MAX : 0;
  return {
    completed: completedCount >= totalObjectives,
    text: `${completedCount} / ${totalObjectives} Objectives Complete`,
    percent: Math.min(PERCENT_COMPLETE_MAX, percent),
  };
}
