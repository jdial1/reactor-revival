import {
  CHAPTER_NAMES,
  CHAPTER_SIZE_DEFAULT,
  CHAPTER_4_SIZE,
} from "./objectiveConstants.js";

function buildLoadingDisplayInfo(objective) {
  return {
    chapterName: "Loading...",
    chapterProgressText: "0 / 10",
    chapterProgressPercent: 0,
    title: objective.title || "Loading...",
    description: objective.description || "",
    flavor_text: objective.flavor_text,
    progressText: "Loading...",
    progressPercent: 0,
    reward: {
      money: objective.reward || 0,
      ep: objective.ep_reward || 0,
    },
    isComplete: objective.completed || false,
    isChapterCompletion: objective.isChapterCompletion || false,
  };
}

function getChapterSize(chapterIndex) {
  return chapterIndex === 3 ? CHAPTER_4_SIZE : CHAPTER_SIZE_DEFAULT;
}

function computeCompletedInChapter(manager, chapterStart, index, objective) {
  let completed = 0;
  for (let i = chapterStart; i < index; i++) {
    if (manager.objectives_data[i] && manager.objectives_data[i].completed) completed++;
  }
  if (objective.completed) completed++;
  return completed;
}

function buildDisplayInfoFromProgress(objective, chapterIndex, chapterSize, completedInChapter, progress) {
  const safeProgress = progress || { text: "Loading...", percent: 0 };
  return {
    chapterName: CHAPTER_NAMES[chapterIndex] || `Chapter ${chapterIndex + 1}`,
    chapterProgressText: `${completedInChapter} / ${chapterSize}`,
    chapterProgressPercent: (completedInChapter / chapterSize) * 100,
    title: objective.title,
    description: objective.description || "",
    flavor_text: objective.flavor_text,
    progressText: safeProgress.text,
    progressPercent: Math.min(100, safeProgress.percent),
    reward: {
      money: objective.reward || 0,
      ep: objective.ep_reward || 0,
    },
    isComplete: objective.completed || false,
    isChapterCompletion: objective.isChapterCompletion || false,
  };
}

export function formatDisplayInfo(manager) {
  if (!manager.current_objective_def || manager.current_objective_index < 0) return null;
  const index = manager.current_objective_index;
  const objective = manager.current_objective_def;
  if (!manager.game || !manager.game.tileset || !manager.game.reactor) {
    return buildLoadingDisplayInfo(objective);
  }
  const chapterIndex = Math.floor(index / CHAPTER_SIZE_DEFAULT);
  const chapterStart = chapterIndex * CHAPTER_SIZE_DEFAULT;
  const chapterSize = getChapterSize(chapterIndex);
  const completedInChapter = computeCompletedInChapter(manager, chapterStart, index, objective);
  const progress = manager.getCurrentObjectiveProgress();
  return buildDisplayInfoFromProgress(
    objective,
    chapterIndex,
    chapterSize,
    completedInChapter,
    progress
  );
}
