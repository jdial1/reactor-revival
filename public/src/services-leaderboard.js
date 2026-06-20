import { LeaderboardResponseSchema } from "./schema/index.js";
import { queryClient, queryKeys } from "./services-query.js";
import {
  logger,
  isTestEnv,
  LEADERBOARD_CONFIG,
  StorageUtils,
} from "./utils.js";
import {
  outboxEnqueue,
  outboxPeekReady,
  outboxRemoveById,
  outboxUpdateById,
} from "./network-outbox.js";

const LB_FAILURE_THRESHOLD = 2;
const LB_COOLDOWN_MS = 30000;
const LB_OUTBOX_BACKOFF_BASE_MS = 5000;
const LB_OUTBOX_BACKOFF_MAX_MS = 300000;
const LOCAL_BEST_RUNS_KEY = "reactor_local_best_runs";

function cacheLocalBestRun(stats) {
  const cache = StorageUtils.get(LOCAL_BEST_RUNS_KEY, {});
  const run = {
    power: stats.power,
    heat: stats.heat,
    money: stats.money,
    time: stats.time,
    time_played: stats.time,
    layout: stats.layout ?? null,
    timestamp: Date.now(),
  };
  ["power", "heat", "money"].forEach((metric) => {
    const val = Number(stats[metric]) || 0;
    const prev = cache[metric];
    if (!prev || val > (Number(prev[metric]) || 0)) cache[metric] = { ...run };
  });
  StorageUtils.set(LOCAL_BEST_RUNS_KEY, cache);
}

export function getLocalBestRun(sortBy = "power") {
  const cache = StorageUtils.get(LOCAL_BEST_RUNS_KEY, {});
  return cache[sortBy] ?? null;
}

export class LeaderboardService {
  constructor() {
    this.initialized = false;
    this.initPromise = null;
    this.apiBaseUrl = LEADERBOARD_CONFIG.API_URL;
    this.lastSaveTime = 0;
    this.saveCooldownMs = 60000;
    this.pendingSave = null;
    this.disabled = isTestEnv();
    this._circuitState = "closed";
    this._failureStreak = 0;
    this._openUntil = 0;
    this._outboxRunning = false;
  }

  getStatus() {
    const now = Date.now();
    if (this._circuitState === "open" && now < this._openUntil) {
      return { state: "open", retryAfterMs: this._openUntil - now };
    }
    if (this._circuitState === "open" && now >= this._openUntil) {
      return { state: "half_open", retryAfterMs: 0 };
    }
    if (this._circuitState === "half_open") return { state: "half_open", retryAfterMs: 0 };
    return { state: "closed", retryAfterMs: 0 };
  }

  _circuitAllowsRequest() {
    const now = Date.now();
    if (this._circuitState === "open" && now < this._openUntil) return false;
    if (this._circuitState === "open" && now >= this._openUntil) {
      this._circuitState = "half_open";
      return true;
    }
    return true;
  }

  _onLeaderboardSuccess() {
    this._failureStreak = 0;
    if (this._circuitState === "half_open" || this._circuitState === "open") {
      this._circuitState = "closed";
      this._openUntil = 0;
    }
  }

  _onLeaderboardFailure() {
    this._failureStreak++;
    if (this._circuitState === "half_open") {
      this._circuitState = "open";
      this._openUntil = Date.now() + LB_COOLDOWN_MS;
      return;
    }
    if (this._failureStreak >= LB_FAILURE_THRESHOLD) {
      this._circuitState = "open";
      this._openUntil = Date.now() + LB_COOLDOWN_MS;
    }
  }

  _scheduleOutboxDrain() {
    if (this.disabled) return;
    const run = () => this._drainLeaderboardOutbox();
    if (typeof requestIdleCallback === "function") {
      requestIdleCallback(run, { timeout: 5000 });
    } else {
      setTimeout(run, 2000);
    }
  }

  async _drainLeaderboardOutbox() {
    if (this._outboxRunning || this.disabled) return;
    const row = await outboxPeekReady();
    if (!row || row.type !== "leaderboard" || !row.payload) return;
    if (!this._circuitAllowsRequest()) {
      this._scheduleOutboxDrain();
      return;
    }
    this._outboxRunning = true;
    try {
      const response = await fetch(`${this.apiBaseUrl}/api/leaderboard/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(row.payload),
      });
      if (response.ok) {
        await outboxRemoveById(row.id);
        this._onLeaderboardSuccess();
        this.lastSaveTime = Date.now();
      } else {
        const attempts = (row.attempts ?? 0) + 1;
        const delay = Math.min(LB_OUTBOX_BACKOFF_MAX_MS, LB_OUTBOX_BACKOFF_BASE_MS * Math.pow(2, attempts));
        await outboxUpdateById(row.id, { attempts, nextRetryAt: Date.now() + delay });
        this._onLeaderboardFailure();
      }
    } catch (e) {
      const attempts = (row.attempts ?? 0) + 1;
      const delay = Math.min(LB_OUTBOX_BACKOFF_MAX_MS, LB_OUTBOX_BACKOFF_BASE_MS * Math.pow(2, attempts));
      await outboxUpdateById(row.id, { attempts, nextRetryAt: Date.now() + delay });
      this._onLeaderboardFailure();
      logger.log("error", "game", "Leaderboard outbox save failed", e);
    } finally {
      this._outboxRunning = false;
      const next = await outboxPeekReady();
      if (next) this._scheduleOutboxDrain();
    }
  }

  async _performSaveRun(stats) {
    try {
      if (!this._circuitAllowsRequest()) {
        await outboxEnqueue({
          type: "leaderboard",
          payload: {
            user_id: stats.user_id,
            run_id: stats.run_id,
            heat: stats.heat,
            power: stats.power,
            money: stats.money,
            time: stats.time,
            layout: stats.layout || null,
          },
        });
        this._scheduleOutboxDrain();
        return;
      }
      const response = await fetch(`${this.apiBaseUrl}/api/leaderboard/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: stats.user_id,
          run_id: stats.run_id,
          heat: stats.heat,
          power: stats.power,
          money: stats.money,
          time: stats.time,
          layout: stats.layout || null,
        }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        logger.log("error", "game", "Error saving run to leaderboard:", errorData.error || response.statusText);
        this._onLeaderboardFailure();
        await outboxEnqueue({
          type: "leaderboard",
          payload: {
            user_id: stats.user_id,
            run_id: stats.run_id,
            heat: stats.heat,
            power: stats.power,
            money: stats.money,
            time: stats.time,
            layout: stats.layout || null,
          },
        });
        this._scheduleOutboxDrain();
      } else {
        this.lastSaveTime = Date.now();
        this._onLeaderboardSuccess();
      }
    } catch (e) {
      logger.log("error", "game", "Error saving run to leaderboard", e);
      this._onLeaderboardFailure();
      await outboxEnqueue({
        type: "leaderboard",
        payload: {
          user_id: stats.user_id,
          run_id: stats.run_id,
          heat: stats.heat,
          power: stats.power,
          money: stats.money,
          time: stats.time,
          layout: stats.layout || null,
        },
      });
      this._scheduleOutboxDrain();
    } finally {
      this.pendingSave = null;
    }
  }

  async init() {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;
    if (this.disabled) {
      this.initialized = true;
      return;
    }

    this.initPromise = (async () => {
      try {
        const response = await fetch(`${this.apiBaseUrl}/health`);
        if (response.ok) {
          this.initialized = true;
          this._onLeaderboardSuccess();
        } else {
          logger.log("warn", "game", "Leaderboard API health check failed");
          this._onLeaderboardFailure();
        }
      } catch (e) {
        const errorMsg = e.message || String(e);
        logger.log("debug", "game", "Leaderboard service unavailable:", errorMsg);
        this._onLeaderboardFailure();
      } finally {
        this.initPromise = null;
      }
      this._scheduleOutboxDrain();
    })();

    return this.initPromise;
  }

  async saveRun(stats) {
    if (this.disabled) return;
    cacheLocalBestRun(stats);
    if (!this.initialized) {
      await this.init();
    }

    const now = Date.now();
    const timeSinceLastSave = now - this.lastSaveTime;

    if (timeSinceLastSave < this.saveCooldownMs) {
      return;
    }

    if (this.pendingSave) {
      return;
    }

    this.pendingSave = this._performSaveRun(stats);

    return this.pendingSave;
  }

  async getTopRuns(sortBy = "power", limit = 10) {
    if (this.disabled) return [];
    if (!this.initialized) await this.init();

    const validSorts = ["heat", "power", "money", "timestamp"];
    const safeSort = validSorts.includes(sortBy) ? sortBy : "power";

    return queryClient.fetchQuery({
      queryKey: queryKeys.leaderboard(safeSort, limit),
      queryFn: async () => {
        if (!this._circuitAllowsRequest()) {
          return [];
        }
        try {
          const response = await fetch(
            `${this.apiBaseUrl}/api/leaderboard/top?sortBy=${safeSort}&limit=${limit}`
          );
          if (!response.ok) {
            logger.log("error", "game", "Error getting top runs:", response.statusText);
            this._onLeaderboardFailure();
            return [];
          }
          const data = await response.json();
          const parsed = LeaderboardResponseSchema.safeParse(data);
          if (!parsed.success) {
            logger.log("warn", "game", "Invalid leaderboard data format");
            this._onLeaderboardFailure();
            return [];
          }
          const rows = parsed.data.success ? parsed.data.data : [];
          this._onLeaderboardSuccess();
          return rows;
        } catch (e) {
          logger.log("debug", "game", "Leaderboard fetch failed (503/CORS/network):", e?.message || e);
          this._onLeaderboardFailure();
          return [];
        }
      },
      staleTime: 60 * 1000,
      retry: 2,
    });
  }
}

export const leaderboardService = new LeaderboardService();
