import { logger } from "../utils/logger.js";

export async function initSocketConnection(splashManager) {
  if (typeof navigator !== "undefined" && !navigator.onLine) return null;
  if (typeof io === "undefined") return null;
  try {
    const { LEADERBOARD_CONFIG } = await import("./leaderboardService.js");
    const apiUrl = LEADERBOARD_CONFIG.API_URL;
    const socket = io(apiUrl, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
    });
    splashManager.socket = socket;
    socket.on("connect", () => {
    });
    socket.on("userCount", (count) => {
      splashManager.userCount = count;
      splashManager.updateUserCountDisplay();
    });
    socket.on("disconnect", () => {
    });
    socket.on("connect_error", (error) => {
      logger.log('warn', 'splash', 'Socket.IO connection error:', error);
    });
    return socket;
  } catch (error) {
    logger.log('warn', 'splash', 'Failed to initialize Socket.IO:', error);
    return null;
  }
}
