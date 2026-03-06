import { z } from "zod";

const ArrayBufferLike = typeof SharedArrayBuffer !== "undefined"
  ? z.union([z.instanceof(ArrayBuffer), z.instanceof(SharedArrayBuffer)])
  : z.instanceof(ArrayBuffer);

const GameLoopPartRowSchema = z.object({
  id: z.string(),
  containment: z.number().optional().default(0),
  vent: z.number().optional().default(0),
  power: z.number().optional().default(0),
  heat: z.number().optional().default(0),
  category: z.string().optional().default(""),
  ticks: z.number().optional().default(0),
  type: z.string().optional().default(""),
  ep_heat: z.number().optional().default(0),
  level: z.number().optional().default(1),
  transfer: z.number().optional().default(0),
}).passthrough();

const GameLoopLayoutRowSchema = z.object({
  r: z.number().int().min(0),
  c: z.number().int().min(0),
  partIndex: z.number().int().min(0),
  ticks: z.number().optional().default(0),
  activated: z.boolean().optional().default(false),
  transferRate: z.number().optional().default(0),
  ventRate: z.number().optional().default(0),
}).passthrough();

const GameLoopReactorStateSchema = z.object({
  current_heat: z.union([z.number(), z.any()]).optional().default(0),
  current_power: z.union([z.number(), z.any()]).optional().default(0),
  max_heat: z.number().optional().default(0),
  max_power: z.number().optional().default(0),
  auto_sell_multiplier: z.number().optional().default(0),
  sell_price_multiplier: z.number().optional().default(1),
  power_overflow_to_heat_ratio: z.number().optional().default(0.5),
  power_multiplier: z.number().optional().default(1),
  heat_controlled: z.number().optional().default(0),
  vent_multiplier_eff: z.number().optional().default(0),
  stirling_multiplier: z.number().optional().default(0),
}).passthrough();

export const GameLoopTickInputSchema = z.object({
  type: z.literal("tick"),
  tickId: z.number().int().min(1),
  tickCount: z.number().int().min(1).optional().default(1),
  multiplier: z.number().optional().default(1),
  heatBuffer: ArrayBufferLike,
  partLayout: z.array(GameLoopLayoutRowSchema),
  partTable: z.array(GameLoopPartRowSchema),
  reactorState: GameLoopReactorStateSchema,
  rows: z.number().int().min(1),
  cols: z.number().int().min(1),
  maxCols: z.number().int().min(1).optional(),
  autoSell: z.boolean().optional().default(false),
  current_money: z.union([z.number(), z.string()]).optional(),
}).passthrough();

export const GameLoopTickResultSchema = z.object({
  type: z.literal("tickResult").optional(),
  tickId: z.number().int().min(0),
  reactorHeat: z.number().optional().default(0),
  reactorPower: z.number().optional().default(0),
  explosionIndices: z.array(z.number().int().min(0)).optional().default([]),
  depletionIndices: z.array(z.number().int().min(0)).optional().default([]),
  tileUpdates: z.array(z.object({ r: z.number().int(), c: z.number().int(), ticks: z.number() })).optional().default([]),
  moneyEarned: z.number().optional().default(0),
  powerDelta: z.number().optional().default(0),
  heatDelta: z.number().optional().default(0),
  tickCount: z.number().int().min(1).optional().default(1),
  transfers: z.array(z.unknown()).optional().default([]),
  error: z.boolean().optional(),
}).passthrough();

export const PhysicsTickInputSchema = z.object({
  heatBuffer: ArrayBufferLike,
  containmentBuffer: ArrayBufferLike.optional(),
  reactorHeat: z.number().optional().default(0),
  multiplier: z.number().optional().default(1),
  tickId: z.number().int().min(0),
  useSAB: z.boolean().optional(),
  rows: z.number().int().min(1).optional(),
  cols: z.number().int().min(1).optional(),
  nInlets: z.number().int().min(0).optional().default(0),
  nValves: z.number().int().min(0).optional().default(0),
  nValveNeighbors: z.number().int().min(0).optional().default(0),
  nExchangers: z.number().int().min(0).optional().default(0),
  nOutlets: z.number().int().min(0).optional().default(0),
  inletsData: z.any().optional(),
  valvesData: z.any().optional(),
  valveNeighborData: z.any().optional(),
  exchangersData: z.any().optional(),
  outletsData: z.any().optional(),
}).passthrough();

export const PhysicsTickResultSchema = z.object({
  reactorHeat: z.number().optional().default(0),
  heatFromInlets: z.number().optional().default(0),
  transfers: z.array(z.object({ fromIdx: z.number(), toIdx: z.number(), amount: z.number() })).optional().default([]),
  explosionIndices: z.array(z.number().int().min(0)).optional().default([]),
  tickId: z.number().int().min(0),
  useSAB: z.boolean().optional(),
  heatBuffer: z.any().optional(),
  containmentBuffer: z.any().optional(),
  inletsData: z.any().optional(),
  valvesData: z.any().optional(),
  valveNeighborData: z.any().optional(),
  exchangersData: z.any().optional(),
  outletsData: z.any().optional(),
}).passthrough();
