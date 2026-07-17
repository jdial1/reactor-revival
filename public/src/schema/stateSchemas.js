import { z } from "../../lib/zod.js";
import { toDecimal } from "../simUtils.js";
import {
  DecimalSchema,
  SaveDecimalSchema,
  ObjectiveIndexSchema,
  NumericToNumber,
} from "./numberLikeSchema.js";
import { BalanceConfigSchema } from "./balanceConfigSchema.js";
import { migrateSave } from "./saveMigration.js";

export const TechTreeDoctrineSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    shortTitle: z.string().optional(),
    subtitle: z.string().optional(),
    playstyle: z.string().optional(),
    focus: z.string().optional(),
    mechanics: z.array(z.string()).optional(),
    color: z.string().optional(),
    icon: z.string().optional(),
    upgrades: z.array(z.string()),
    bonuses: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export const TechTreeSchema = z.array(TechTreeDoctrineSchema);

export const ObjectiveDefinitionSchema = z
  .object({
    title: z.string(),
    flavor_text: z.string().optional(),
    reward: z.number().optional(),
    ep_reward: z.number().optional(),
    checkId: z.string(),
    isChapterCompletion: z.boolean().optional(),
  })
  .strict();

export const ObjectiveListSchema = z.array(ObjectiveDefinitionSchema);

export const AchievementDefinitionSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    description: z.string(),
    group: z.enum(["hazard", "engineering", "discovery", "milestone"]),
    icon: z.string().optional(),
    triggerType: z.enum(["event", "tick"]),
    triggerEvent: z.string().optional(),
    checkId: z.string().optional(),
  })
  .strict();

export const AchievementListSchema = z.array(AchievementDefinitionSchema);

export const GameDimensionsSchema = z.object({
  base_cols: z.number().int().min(1).default(12),
  base_rows: z.number().int().min(1).default(12),
});

export const DifficultyPresetSchema = z.object({
  base_money: z.union([z.number(), z.string()]),
  base_max_heat: z.union([z.number(), z.string()]),
  base_max_power: z.union([z.number(), z.string()]),
  base_loop_wait: z.union([z.number(), z.string()]),
  base_manual_heat_reduce: z.union([z.number(), z.string()]),
  power_overflow_to_heat_pct: z.union([z.number(), z.string()]),
});

const HelpTextSectionSchema = z.record(z.string(), z.union([z.string(), z.object({ title: z.string(), content: z.string() }).passthrough()]));
export const HelpTextSchema = z.record(z.string(), HelpTextSectionSchema);

export const ChangelogEntrySchema = z.object({
  version: z.string(),
  date: z.string().optional(),
  bullets: z.array(z.string()).min(1),
});

export const ChangelogSchema = z.array(ChangelogEntrySchema);

export const FailureFlavorSchema = z.record(z.string(), z.string());

export const VersionSchema = z.object({
  version: z.string().optional().default("Unknown"),
}).passthrough();

export const PartDefinitionSchema = z.object({
  id: z.string(),
  type: z.string(),
  title: z.string(),
  category: z.string(),
  base_cost: DecimalSchema.optional().default(0),
  base_ecost: DecimalSchema.optional().default(0),
  cell_tick_upgrade_cost: DecimalSchema.optional(),
  cell_power_upgrade_cost: DecimalSchema.optional(),
  cell_perpetual_upgrade_cost: DecimalSchema.optional(),
  levels: z.number().int().min(1).optional(),
  level: z.number().int().min(1).optional().default(1),
  base_power: z.number().optional().default(0),
  base_heat: z.number().optional().default(0),
  base_ticks: z.number().optional().default(0),
  base_containment: z.number().optional(),
  base_vent: z.number().optional().default(0),
  base_transfer: z.number().optional().default(0),
  base_reactor_power: z.number().optional().default(0),
  base_reactor_heat: z.number().optional().default(0),
  base_power_increase: z.number().optional().default(0),
  base_heat_increase: z.number().optional().default(0),
  base_ep_heat: z.number().optional().default(0),
  base_description: z.string().optional().default(""),
  erequires: z.string().optional().nullable(),
  experimental: z.boolean().optional().default(false),
  location: z.string().optional().nullable(),
  valve_group: z.string().optional().nullable(),
  activation_threshold: z.union([z.number(), z.string()]).optional().nullable(),
  transfer_direction: z.string().optional().nullable(),
  cell_count: z.number().optional().default(0),
  cost_multi: z.number().optional().default(1).describe("Economy: per-level shop price multiplier"),
  ticks_multiplier: z.number().optional(),
  containment_multi: z.number().optional().describe("Stats: per-level containment scaling on parts"),
  reactor_power_multi: z.number().optional().describe("Stats: per-level reactor power storage scaling"),
  reactor_heat_multiplier: z.number().optional(),
  vent_multiplier: z.number().optional().describe("Stats: per-level vent rate scaling"),
  transfer_multiplier: z.number().optional().describe("Stats: per-level heat transfer scaling"),
  power_increase_add: z.number().optional(),
  containment_multiplier: z.number().optional(),
  ep_heat_multiplier: z.number().optional(),
  cell_tick_upgrade_multi: z.number().optional().describe("Economy: cell tick upgrade price multiplier per level"),
  cell_power_upgrade_multi: z.number().optional().describe("Economy: cell power upgrade price multiplier per level"),
  range: z.number().int().min(1).optional(),
  topologyType: z.enum(["Manhattan", "Orthogonal", "Cross", "Radial", "Global"]).optional(),
  vent_consumes_power: z.boolean().optional(),
  outlet_respect_neighbor_cap: z.boolean().optional(),
  capacitor_autosell_heat_ratio: z.number().optional(),
  traits: z.array(z.string()).optional().default([]),
}).strict();

export const UpgradeDefinitionSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  cost: DecimalSchema.optional().default(0),
  type: z.string(),
  multiplier: z.number().optional().default(1.5),
  levels: z.number().int().min(1).optional(),
  ecost: DecimalSchema.optional().default(0),
  ecost_multiplier: z.number().optional().default(1.5),
  erequires: z.string().optional(),
  actionId: z.string().optional(),
  category: z.string().optional(),
  icon: z.string().optional(),
  classList: z.array(z.string()).optional().default([]),
  part_level: z.number().int().min(1).optional(),
}).strict();

export const TileSchema = z.object({
  row: z.number().int().min(0),
  col: z.number().int().min(0),
  partId: z.string(),
  ticks: z.number().optional().default(0),
  heat_contained: z.number().optional().default(0),
});

const ReactorStateSchema = z.object({
  current_heat: SaveDecimalSchema.optional().default(toDecimal(0)),
  current_power: SaveDecimalSchema.optional().default(toDecimal(0)),
  has_melted_down: z.boolean().optional(),
  base_max_heat: NumericToNumber.optional(),
  base_max_power: NumericToNumber.optional(),
  altered_max_heat: NumericToNumber.optional(),
  altered_max_power: NumericToNumber.optional(),
});

const UpgradeStateSchema = z.object({
  id: z.string(),
  level: z.number().int().min(0),
});

const InfiniteObjectiveSchema = z
  .object({
    title: z.string().optional(),
    checkId: z.string().optional(),
    target: z.unknown().optional(),
    reward: z.unknown().optional(),
    completed: z.boolean().optional(),
    _lastInfinitePowerTarget: z.number().optional(),
    _lastInfiniteHeatMaintain: z.number().optional(),
    _lastInfiniteMoneyThorium: z.number().optional(),
    _lastInfiniteHeat: z.number().optional(),
    _lastInfiniteEP: z.number().optional(),
    _infiniteChallengeIndex: z.number().optional(),
    _infiniteCompletedCount: z.number().optional(),
  })
  .passthrough()
  .optional();

const TilesCompactSchema = z.object({
  encoding: z.literal("u16_f32f32"),
  rows: z.number().int().min(1),
  cols: z.number().int().min(1),
  ids_b64: z.string(),
  ticks_b64: z.string(),
  heat_b64: z.string(),
});

const LatestSaveBodySchema = z.object({
  save_format_version: z.number().int().min(1).optional().default(1),
  part_table: z.array(z.string()).optional().default([]),
  tiles_compact: TilesCompactSchema.optional(),
  version: z.string().optional().default("1.0.0"),
  current_money: SaveDecimalSchema.catch(toDecimal(0)).optional().default(toDecimal(0)),
  rows: z.number().int().min(1).optional().default(12),
  cols: z.number().int().min(1).optional().default(12),
  run_id: z
    .union([z.string(), z.undefined()])
    .optional()
    .transform((v) => (v && v.length > 0 ? v : crypto.randomUUID()))
    .catch(() => crypto.randomUUID()),
  tech_tree: z.string().optional().nullable(),
  protium_particles: z.number().catch(0).optional().default(0),
  total_exotic_particles: SaveDecimalSchema.catch(toDecimal(0)).optional().default(toDecimal(0)),
  exotic_particles: SaveDecimalSchema.catch(toDecimal(0)).optional().default(toDecimal(0)),
  current_exotic_particles: SaveDecimalSchema.catch(toDecimal(0)).optional().default(toDecimal(0)),
  session_power_produced: SaveDecimalSchema.catch(toDecimal(0)).optional().default(toDecimal(0)),
  session_power_sold: SaveDecimalSchema.catch(toDecimal(0)).optional().default(toDecimal(0)),
  session_heat_dissipated: SaveDecimalSchema.catch(toDecimal(0)).optional().default(toDecimal(0)),
  sold_power: z.boolean().optional().default(false),
  sold_heat: z.boolean().optional().default(false),
  grace_period_ticks: z.number().optional().default(0),
  total_played_time: z.number().optional().default(0),
  last_save_time: z.number().optional().nullable(),
  base_rows: z.number().optional().default(12),
  base_cols: z.number().optional().default(12),
  reactor: ReactorStateSchema.optional(),
  placedCounts: z.record(z.string(), z.number()).optional().default({}),
  tiles: z.array(TileSchema).default([]),
  upgrades: z.array(UpgradeStateSchema).default([]),
  objectives: z.object({
    current_objective_index: ObjectiveIndexSchema,
    completed_objectives: z.array(z.union([z.boolean(), z.null(), z.undefined()]).transform((v) => v === true)).optional().default([]),
    infinite_objective: InfiniteObjectiveSchema,
  }).optional().default({ current_objective_index: 0, completed_objectives: [] }),
  toggles: z.record(z.string(), z.unknown()).catch({}).optional().default({}),
  quick_select_slots: z.array(z.unknown()).catch([]).optional().default([]),
  unlocked_achievements: z.array(z.string()).catch([]).optional().default([]),
  achievements: z.object({
    unlocked: z.array(z.string()).optional(),
    trackers: z.record(z.string(), z.unknown()).optional(),
    sustained: z.unknown().optional(),
    soldHeatCount: z.number().optional(),
    lastSnapshot: z.record(z.string(), z.unknown()).optional(),
  }).passthrough().optional(),
  ui: z.object({}).catch({}).optional().default({}),
});

export const SaveDataWriteSchema = LatestSaveBodySchema;
export const SaveDataSchema = z.preprocess(migrateSave, LatestSaveBodySchema);

const BlueprintPartSchema = z.object({
  r: z.number().int().min(0),
  c: z.number().int().min(0),
  t: z.string(),
  id: z.string(),
  lvl: z.number().int().min(1).optional().default(1),
});

export const BlueprintSchema = z.object({
  size: z.object({
    rows: z.number().int().min(1),
    cols: z.number().int().min(1),
  }),
  parts: z.array(BlueprintPartSchema),
});

export const LegacyGridSchema = z.array(z.array(z.unknown())).min(1);

export const EngineStatus = Object.freeze({
  RUNNING: "running",
  STOPPED: "stopped",
  PAUSED: "paused",
  TICK: "tick",
  SIMULATION_ERROR: "simulation_error",
});

export const UserPreferencesSchema = z.object({
  mute: z.boolean().optional().default(false),
  reducedMotion: z.boolean().optional().default(false),
  heatFlowVisible: z.boolean().optional().default(true),
  heatMapVisible: z.boolean().optional().default(false),
  debugOverlay: z.boolean().optional().default(false),
  numberFormat: z.enum(["default", "scientific"]).optional().default("default"),
  volumeMaster: z.number().min(0).max(1).optional().default(0.25),
  volumeEffects: z.number().min(0).max(1).optional().default(0.5),
  volumeAlerts: z.number().min(0).max(1).optional().default(0.5),
  volumeSystem: z.number().min(0).max(1).optional().default(0.5),
  volumeAmbience: z.number().min(0).max(1).optional().default(0.12),
  hideUnaffordableUpgrades: z.boolean().optional().default(false),
  hideUnaffordableResearch: z.boolean().optional().default(false),
  hideMaxUpgrades: z.boolean().optional().default(true),
  hideMaxResearch: z.boolean().optional().default(true),
}).passthrough();

export { BalanceConfigSchema };
