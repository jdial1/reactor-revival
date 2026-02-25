import { boolProgress } from "../objectiveCheckUtils.js";
import { getChapterRange, isChapterComplete, checkChapterCompletion } from "../objectiveChapterUtils.js";
import {
  CHAPTER_1_START_INDEX,
  CHAPTER_2_START_INDEX,
  CHAPTER_3_START_INDEX,
  CHAPTER_4_START_INDEX,
  CHAPTER_SIZE_DEFAULT,
  CHAPTER_4_SIZE,
} from "../objectiveConstants.js";

export const chapterChecks = {
  completeChapter1: (game) => {
    const chapterRange = getChapterRange(CHAPTER_1_START_INDEX, CHAPTER_SIZE_DEFAULT);
    const done = isChapterComplete(game, chapterRange.start, chapterRange.end);
    if (!game.objectives_manager?.objectives_data) return boolProgress(done, "Chapter 1 Complete!", "Loading...");
    const result = checkChapterCompletion(game.objectives_manager.objectives_data, CHAPTER_1_START_INDEX, CHAPTER_SIZE_DEFAULT);
    return { ...result, completed: done };
  },
  completeChapter2: (game) => {
    const chapterRange = getChapterRange(CHAPTER_2_START_INDEX, CHAPTER_SIZE_DEFAULT);
    const done = isChapterComplete(game, chapterRange.start, chapterRange.end);
    if (!game.objectives_manager?.objectives_data) return boolProgress(done, "Chapter 2 Complete!", "Loading...");
    const result = checkChapterCompletion(game.objectives_manager.objectives_data, CHAPTER_2_START_INDEX, CHAPTER_SIZE_DEFAULT);
    return { ...result, completed: done };
  },
  completeChapter3: (game) => {
    const chapterRange = getChapterRange(CHAPTER_3_START_INDEX, CHAPTER_SIZE_DEFAULT);
    const done = isChapterComplete(game, chapterRange.start, chapterRange.end);
    if (!game.objectives_manager?.objectives_data) return boolProgress(done, "Chapter 3 Complete!", "Loading...");
    const result = checkChapterCompletion(game.objectives_manager.objectives_data, CHAPTER_3_START_INDEX, CHAPTER_SIZE_DEFAULT);
    return { ...result, completed: done };
  },
  completeChapter4: (game) => {
    const chapterRange = getChapterRange(CHAPTER_4_START_INDEX, CHAPTER_4_SIZE);
    const done = isChapterComplete(game, chapterRange.start, chapterRange.end);
    if (!game.objectives_manager?.objectives_data) return boolProgress(done, "Chapter 4 Complete!", "Loading...");
    const result = checkChapterCompletion(game.objectives_manager.objectives_data, CHAPTER_4_START_INDEX, CHAPTER_4_SIZE);
    return { ...result, completed: done };
  },
};
