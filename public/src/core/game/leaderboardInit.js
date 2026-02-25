import { logger } from "../../utils/logger.js";
import { leaderboardService } from "../../services/leaderboardService.js";

const EXPECTED_LEADERBOARD_ERROR_TERMS = [
  "SharedArrayBuffer",
  "Atomics",
  "COOP/COEP",
  "Cannot read properties",
  "can't access property",
];

export function initLeaderboardSafe() {
  leaderboardService.init().catch((err) => {
    const errorMsg = err?.message || String(err);
    const isExpected = EXPECTED_LEADERBOARD_ERROR_TERMS.some((term) => errorMsg.includes(term));
    if (!isExpected) {
      logger.warn("Leaderboard init failed:", errorMsg);
    }
  });
}
