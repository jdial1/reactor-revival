import { logger } from "../utils/logger.js";

export async function initSocketConnection(splashManager) {
  if (typeof navigator !== "undefined" && !navigator.onLine) return null;
  if (typeof io === "undefined") return null;
  const isLocalhost = typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");
  if (isLocalhost) return null;
  try {
    const { LEADERBOARD_CONFIG } = await import("./leaderboardService.js");
    const apiUrl = LEADERBOARD_CONFIG.API_URL;
    const socket = io(apiUrl, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 3000,
      reconnectionAttempts: 3,
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
      logger.log('debug', 'splash', 'Socket.IO connection error:', error);
    });
    return socket;
  } catch (error) {
    logger.log('debug', 'splash', 'Failed to initialize Socket.IO:', error);
    return null;
  }
}
