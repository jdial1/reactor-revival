import { z } from "../../lib/zod.js";
import { toDecimal } from "../utils/decimal.js";

const NumericLike = z.union([z.number(), z.string()]);
const GridCoordinate = z.number().int().min(0);

const DecimalSchema = NumericLike.transform((v) => (v != null && v !== "" ? toDecimal(v) : toDecimal(0)));

const PartDefinitionSchema = z.object({
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
  base_range: z.number().optional().default(1),
  base_ep_heat: z.number().optional().default(0),
  base_description: z.string().optional().default(""),
  erequires: z.string().optional().nullable(),
  experimental: z.boolean().optional().default(false),
  location: z.string().optional().nullable(),
  valve_group: z.string().optional().nullable(),
  activation_threshold: z.union([z.number(), z.string()]).optional().nullable(),
  transfer_direction: z.string().optional().nullable(),
  cell_count: z.number().optional().default(0),
  cost_multi: z.number().optional().default(1),
  ticks_multiplier: z.number().optional(),
  containment_multi: z.number().optional(),
  reactor_power_multi: z.number().optional(),
  reactor_heat_multiplier: z.number().optional(),
  vent_multiplier: z.number().optional(),
  transfer_multiplier: z.number().optional(),
  power_increase_add: z.number().optional(),
  containment_multiplier: z.number().optional(),
  ep_heat_multiplier: z.number().optional(),
  cell_tick_upgrade_multi: z.number().optional(),
  cell_power_upgrade_multi: z.number().optional(),
}).passthrough();

const UpgradeDefinitionSchema = z.object({
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
}).passthrough();

const TileSchema = z.object({
  row: z.number().int().min(0),
  col: z.number().int().min(0),
  partId: z.string(),
  ticks: z.number().optional().default(0),
  heat_contained: z.number().optional().default(0),
});

const NumericToNumber = NumericLike.transform((v) => (v != null && v !== "" ? toDecimal(v).toNumber() : undefined));

const ReactorStateSchema = z.object({
  current_heat: NumericLike.optional(),
  current_power: NumericLike.optional(),
  has_melted_down: z.boolean().optional(),
  base_max_heat: NumericToNumber.optional(),
  base_max_power: NumericToNumber.optional(),
  altered_max_heat: NumericToNumber.optional(),
  altered_max_power: NumericToNumber.optional(),
}).passthrough();

const UpgradeStateSchema = z.object({
  id: z.string(),
  level: z.number().int().min(0),
});

const SaveDataSchema = z.object({
  version: z.string(),
  current_money: z.union([z.number(), z.string()]),
  rows: z.number().int().min(1),
  cols: z.number().int().min(1),
  run_id: z.string().optional(),
  tech_tree: z.string().optional().nullable(),
  protium_particles: z.number().optional().default(0),
  total_exotic_particles: z.union([z.number(), z.string()]).optional().default(0),
  exotic_particles: z.union([z.number(), z.string()]).optional().default(0),
  current_exotic_particles: z.union([z.number(), z.string()]).optional().default(0),
  reality_flux: z.union([z.number(), z.string()]).optional().default(0),
  sold_power: z.boolean().optional().default(false),
  sold_heat: z.boolean().optional().default(false),
  grace_period_ticks: z.number().optional().default(0),
  total_played_time: z.number().optional().default(0),
  last_save_time: z.number().optional().nullable(),
  base_rows: z.number().optional(),
  base_cols: z.number().optional(),
  reactor: ReactorStateSchema.optional(),
  placedCounts: z.record(z.string(), z.number()).optional().default({}),
  tiles: z.array(TileSchema).default([]),
  upgrades: z.array(UpgradeStateSchema).default([]),
  objectives: z.object({
    current_objective_index: z.number().optional().default(0),
    completed_objectives: z.array(z.union([z.boolean(), z.null(), z.undefined()]).transform((v) => v === true)).optional().default([]),
    infinite_objective: z.object({}).passthrough().optional(),
  }).passthrough().optional().default({}),
  toggles: z.record(z.string(), z.unknown()).optional().default({}),
  quick_select_slots: z.array(z.unknown()).optional().default([]),
  ui: z.object({}).passthrough().optional().default({}),
}).passthrough();

const DifficultyPresetSchema = z.object({
  base_money: z.union([z.number(), z.string()]),
  base_max_heat: z.union([z.number(), z.string()]),
  base_max_power: z.union([z.number(), z.string()]),
  base_loop_wait: z.union([z.number(), z.string()]),
  base_manual_heat_reduce: z.union([z.number(), z.string()]),
  power_overflow_to_heat_pct: z.union([z.number(), z.string()]),
});

const VersionSchema = z.object({
  version: z.string().optional().default("Unknown"),
}).passthrough();

const BlueprintPartSchema = z.object({
  r: z.number().int().min(0),
  c: z.number().int().min(0),
  t: z.string(),
  id: z.string(),
  lvl: z.number().int().min(1).optional().default(1),
});

const BlueprintSchema = z.object({
  size: z.object({
    rows: z.number().int().min(1),
    cols: z.number().int().min(1),
  }),
  parts: z.array(BlueprintPartSchema),
});

const LegacyGridSchema = z.array(z.array(z.unknown())).min(1);

export {
  PartDefinitionSchema,
  UpgradeDefinitionSchema,
  TileSchema,
  SaveDataSchema,
  DifficultyPresetSchema,
  VersionSchema,
  BlueprintSchema,
  LegacyGridSchema,
  NumericLike,
  GridCoordinate,
};
