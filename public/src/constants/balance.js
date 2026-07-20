import { SIM_CONSTANTS } from "./sim.js";

export const VU_LED_SEGMENTS = 16;

export const LEADERBOARD_CONFIG = Object.freeze({
  API_URL: "http://localhost:3000",
});

export const UPDATE_TOAST_STYLES = Object.freeze({});

export const AUTONOMIC_REPAIR_POWER_COST = 50;
export const AUTONOMIC_REPAIR_POWER_MIN = 50;
export const WEAVE_QUANTUM = 1_000_000;

export const TICKS_FULL_CYCLE = 10000;
export const TICKS_10PCT = 1000;
export const REFERENCE_POWER = 20;
export const OVERRIDE_DURATION_MS = 10000;
export const OP_INLET = 1;
export const OP_VALVE = 2;
export const OP_EXCHANGER = 3;
export const OP_OUTLET = 4;

export const GRID_SIZE_PHYSICS_WORKER_MAX_CELLS = 2500;
export const WORKER_HEARTBEAT_MS = 2000;
export const UPGRADE_MAX_LEVEL = 32;

export const EP_HEAT_SAFE_CAP = 1e100;
export const EP_CHANCE_LOG_BASE = 10;
export const HEAT_REMOVAL_TARGET_RATIO = 0.1;
export const MULTIPLIER_FLOOR = 0.001;
export const MAX_EP_EMIT_PER_TICK = 5;

export const EP_SESSION_MIN_UNITS_PER_EP = 2500;

export const VISUAL_PARTICLE_HIGH_THRESHOLD = 200;
export const VISUAL_PARTICLE_MED_THRESHOLD = 50;
export const VISUAL_PARTICLE_HIGH_COUNT = 3;
export const VISUAL_PARTICLE_MED_COUNT = 2;

export const PAUSED_POLL_MS = 500;

export const BASE_MAX_HEAT = 1000;
export const BASE_MAX_POWER = 100;
export const HULL_HEAT_PER_PLATING_TILE = 100;
export const POWER_STORAGE_PER_CAPACITOR_TILE = 100;
export const POWER_STORAGE_CHARGED_PLATING_EXTRA = 100;
export const SIMULATION_ERROR_MESSAGE = "SIMULATION ERROR: HARDWARE INCOMPATIBILITY";
export const CLASSIFICATION_HISTORY_MAX = 10;
export const MARK_II_E_THRESHOLD_CYCLES = 16;
export const MAX_SUBCLASS_CYCLES = 15;
export const REFLECTOR_COOLING_MIN_MULTIPLIER = 0.1;
export const HEAT_POWER_LOG_CAP = 1e100;
export const HEAT_POWER_LOG_BASE = 1000;
export const PERCENT_DIVISOR = 100;

export const MAX_TEST_FRAMES = 200;
export const SESSION_UPDATE_INTERVAL_MS = 60000;
export const MAX_VISUAL_EVENTS = 500;
export const MAX_VISUAL_REFLECTOR_PAIRS_PER_FRAME = 512;
export const MAX_VISUAL_EXPLOSION_FLASHES_PER_FRAME = 64;
export const VISUAL_DELTA_U32_VERSION = 1;
export const HEAT_CALC_POOL_SIZE = 500;

export const MAX_TICKS_PER_FRAME_NO_SAB = 2;
export const SLOW_MODE_TICKS_PER_FRAME = 2;
export const GAME_LOOP_WORKER_MIN_TICKS = 3;
export const TIME_FLUX_CHUNK_TICKS = 100;
export const SAMPLE_TICKS = 5;
export const OFFLINE_TIME_THRESHOLD_MS = 30000;
export const MAX_ACCUMULATOR_MULTIPLIER = 100;
export const HEAT_SAFETY_STOP_THRESHOLD = 0.9;
export const ACCUMULATOR_EPSILON = SIM_CONSTANTS.heatEpsilon;
export const MAX_LIVE_TICKS = 10;
export const WELCOME_BACK_FF_MAX_TICKS = 100;

export const MAX_GRID_DIMENSION = 50;
export const BASE_MONEY = 10;

export const PRESTIGE_MULTIPLIER_PER_EP = 0.001;
export const PRESTIGE_MULTIPLIER_CAP = 100;
export const RESPEC_DOCTRINE_EP_COST = 50;

export const BASE_COLS_MOBILE = 10;
export const BASE_COLS_DESKTOP = 12;
export const BASE_ROWS_MOBILE = 14;
export const BASE_ROWS_DESKTOP = 12;

export const DEFAULT_AUTOSAVE_INTERVAL_MS = 30000;

export const GRID_TARGET_TOTAL_TILES = 144;
export const GRID_MIN_DIMENSION = 6;
export const GRID_MAX_DISPLAY_DIMENSION = 20;
export const ZOOM_DAMPING_FACTOR = 0.24;
export const PINCH_DISTANCE_THRESHOLD_PX = 10;
export const MOMENTUM_DECAY_FACTOR = 0.92;
export const SNAP_BACK_THRESHOLD_RATIO = 0.4;
export const SNAP_BACK_SPRING_CONSTANT = 0.12;
export const ZOOM_SCALE_MIN = 0.5;
export const ZOOM_SCALE_MAX = 2.0;

export const MAX_PART_VARIANTS = 6;

export const GRID = {
  defaultRows: 12,
  defaultCols: 12,
  defaultTileSize: 48,
  imageCacheMax: 128,
};

export const BALANCE_POWER_THRESHOLD_10K = SIM_CONSTANTS.reactorHeatStandardDivisor;
