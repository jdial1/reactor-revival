import { z } from "zod";
import { toDecimal } from "../../utils/decimal.js";
import { SaveDecimalSchema, NumericToNumber, ObjectiveIndexSchema } from "./common.js";

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
}).passthrough();

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

export const SaveDataSchema = z.preprocess((raw) => {
  if (!raw || typeof raw !== "object") return raw;
  const data = { ...raw };
  if (!data.version) data.version = "1.0.0";
  if (data.tiles && Array.isArray(data.tiles) && data.tiles.length > 0) {
    const first = data.tiles[0];
    if (Array.isArray(first)) {
      const migrated = [];
      (data.tiles || []).forEach((row, r) => {
        (row || []).forEach((cell, c) => {
          if (cell && (cell.partId || cell.id)) {
            migrated.push({
              row: r,
              col: c,
              partId: cell.partId ?? cell.id,
              ticks: cell.ticks ?? 0,
              heat_contained: cell.heat_contained ?? 0,
            });
          }
        });
      });
      data.tiles = migrated;
    }
  }
  return data;
}, z.object({
  version: z.string().optional().default("1.0.0"),
  current_money: SaveDecimalSchema.optional().default(toDecimal(0)),
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
  reality_flux: SaveDecimalSchema.catch(toDecimal(0)).optional().default(toDecimal(0)),
  sold_power: z.boolean().optional().default(false),
  sold_heat: z.boolean().optional().default(false),
  grace_period_ticks: z.number().optional().default(0),
  total_played_time: z.number().optional().default(0),
  last_save_time: z.number().optional().nullable(),
  base_rows: z.number().optional().default(12),
  base_cols: z.number().optional().default(12),
  reactor: ReactorStateSchema.optional(),
  placedCounts: z.record(z.string(), z.number()).catch({}).optional().default({}),
  tiles: z.array(TileSchema).catch([]).default([]),
  upgrades: z.array(UpgradeStateSchema).catch([]).default([]),
  objectives: z.object({
    current_objective_index: ObjectiveIndexSchema,
    completed_objectives: z.array(z.union([z.boolean(), z.null(), z.undefined()]).transform((v) => v === true)).optional().default([]),
    infinite_objective: InfiniteObjectiveSchema,
  }).passthrough().catch({}).optional().default({}),
  toggles: z.record(z.string(), z.unknown()).catch({}).optional().default({}),
  quick_select_slots: z.array(z.unknown()).catch([]).optional().default([]),
  ui: z.object({}).passthrough().catch({}).optional().default({}),
}).passthrough());
