import { z } from "zod";

export * from "./schemas/common.js";
export * from "./schemas/game.js";
export * from "./schemas/parts.js";
export * from "./schemas/save.js";
export * from "./schemas/worker.js";

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

const ComponentExplosionPayloadSchema = z.object({
  row: z.number().int().min(0),
  col: z.number().int().min(0),
  partId: z.string().optional(),
}).passthrough();

const MeltdownPayloadSchema = z.object({
  hasMeltedDown: z.boolean().optional(),
}).passthrough();

const VibrationRequestPayloadSchema = z.object({
  type: z.enum(["heavy", "meltdown", "doublePulse"]).optional(),
}).passthrough();

const SaveLoadedPayloadSchema = z.object({
  toggles: z.record(z.string(), z.unknown()).optional(),
  quick_select_slots: z.array(z.unknown()).optional(),
}).passthrough();

const ExoticParticlesChangedPayloadSchema = z.object({}).passthrough();

const ToggleStateChangedPayloadSchema = z.object({
  toggleName: z.string(),
  value: z.unknown(),
}).passthrough();

const ReactorTickPayloadSchema = z.object({
  current_heat: z.union([z.number(), z.any()]).optional(),
  current_power: z.union([z.number(), z.any()]).optional(),
}).passthrough();

const TimeFluxPayloadSchema = z.object({
  queuedTicks: z.number().optional(),
  progress: z.number().optional(),
  isCatchingUp: z.boolean().optional(),
  deltaTime: z.number().optional(),
}).passthrough();

const MoneyChangedPayloadSchema = z.object({
  current_money: z.any().optional(),
}).passthrough();

const StatePatchPayloadSchema = z.object({
  loop_wait: z.number().optional(),
  manual_heat_reduce: z.number().optional(),
}).passthrough();

export const EVENT_SCHEMA_REGISTRY = {
  component_explosion: ComponentExplosionPayloadSchema,
  meltdown: MeltdownPayloadSchema,
  meltdownResolved: MeltdownPayloadSchema,
  meltdownStarted: z.object({}).passthrough(),
  vibrationRequest: VibrationRequestPayloadSchema,
  saveLoaded: SaveLoadedPayloadSchema,
  exoticParticlesChanged: ExoticParticlesChangedPayloadSchema,
  toggleStateChanged: ToggleStateChangedPayloadSchema,
  reactorTick: ReactorTickPayloadSchema,
  powerSold: z.object({}).passthrough(),
  clearAnimations: z.object({}).passthrough(),
  clearImageCache: z.object({}).passthrough(),
  layoutPasted: z.object({ layout: z.any() }).passthrough(),
  gridResized: z.object({}).passthrough(),
  grid_changed: z.object({}).passthrough(),
  tickRecorded: z.object({}).passthrough(),
  timeFluxButtonUpdate: TimeFluxPayloadSchema,
  timeFluxSimulationUpdate: TimeFluxPayloadSchema,
  welcomeBackOffline: TimeFluxPayloadSchema,
  moneyChanged: MoneyChangedPayloadSchema,
  statePatch: StatePatchPayloadSchema,
  quickSelectSlotsChanged: z.object({ slots: z.array(z.unknown()).optional() }).passthrough(),
  upgradePurchased: z.object({ upgrade: z.any().optional() }).passthrough(),
  heatWarning: z.object({ heatRatio: z.number().optional(), tickCount: z.number().optional() }).passthrough(),
  pipeIntegrityWarning: z.object({ heatRatio: z.number().optional(), tickCount: z.number().optional() }).passthrough(),
  firstHighHeat: z.object({ heatRatio: z.number().optional(), tickCount: z.number().optional() }).passthrough(),
};

const TileRefSchema = z.custom((val) => val != null && typeof val.row === "number" && typeof val.col === "number");

const SellPartPayloadSchema = z.object({
  tile: TileRefSchema,
}).strict();

const LayoutCellSchema = z.object({
  id: z.string(),
  t: z.string().optional(),
  lvl: z.number().int().min(1).optional().default(1),
}).passthrough();

const LayoutGridSchema = z.array(z.array(z.union([LayoutCellSchema.nullable(), z.null()])));

const PasteLayoutPayloadSchema = z.object({
  layout: z.union([LayoutGridSchema, BlueprintSchema]),
  options: z.object({
    skipCostDeduction: z.boolean().optional().default(false),
  }).passthrough().optional().default({}),
}).strict();

export const ACTION_SCHEMA_REGISTRY = {
  sell: z.object({}).strict(),
  manualReduceHeat: z.object({}).strict(),
  pause: z.object({}).strict(),
  resume: z.object({}).strict(),
  togglePause: z.object({}).strict(),
  rebootKeepEp: z.object({}).strict(),
  rebootDiscardEp: z.object({}).strict(),
  reboot: z.object({}).strict(),
  sellPart: SellPartPayloadSchema,
  pasteLayout: PasteLayoutPayloadSchema,
};

const GameActionTypeSchema = z.enum(["sell", "manualReduceHeat", "pause", "resume", "togglePause", "rebootKeepEp", "rebootDiscardEp", "reboot", "sellPart", "pasteLayout"]);

export const GameActionSchema = z.object({
  type: GameActionTypeSchema,
  payload: z.record(z.string(), z.unknown()).optional().default({}),
});

export const UserPreferencesSchema = z.object({
  mute: z.boolean().optional().default(false),
  reducedMotion: z.boolean().optional().default(false),
  heatFlowVisible: z.boolean().optional().default(true),
  heatMapVisible: z.boolean().optional().default(false),
  debugOverlay: z.boolean().optional().default(false),
  forceNoSAB: z.boolean().optional().default(false),
  numberFormat: z.enum(["default", "scientific"]).optional().default("default"),
  volumeMaster: z.number().min(0).max(1).optional().default(0.25),
  volumeEffects: z.number().min(0).max(1).optional().default(0.5),
  volumeAlerts: z.number().min(0).max(1).optional().default(0.5),
  volumeSystem: z.number().min(0).max(1).optional().default(0.5),
  volumeAmbience: z.number().min(0).max(1).optional().default(0.12),
  hideUnaffordableUpgrades: z.boolean().optional().default(true),
  hideUnaffordableResearch: z.boolean().optional().default(true),
  hideMaxUpgrades: z.boolean().optional().default(true),
  hideMaxResearch: z.boolean().optional().default(true),
  hideOtherDoctrineUpgrades: z.boolean().optional().default(false),
}).passthrough();

export const BalanceConfigSchema = z.object({
  valveTopupCapRatio: z.number().min(0).max(1),
  autoSellMultiplierPerLevel: z.number().min(0),
  stirlingMultiplierPerLevel: z.number().min(0),
  defaultCostMultiplier: z.number().min(1),
  reflectorSellMultiplier: z.number().min(0),
  cellSellMultiplier: z.number().min(0),
  powerThreshold10k: z.number().min(0),
  marketLobbyingMultPerLevel: z.number().min(0),
  emergencyCoolantMultPerLevel: z.number().min(0),
  reflectorCoolingFactorPerLevel: z.number().min(0),
  insurancePercentPerLevel: z.number().min(0).max(1),
  manualOverrideMultPerLevel: z.number().min(0),
  convectiveBoostPerLevel: z.number().min(0),
  electroThermalBaseRatio: z.number().min(0),
  electroThermalStep: z.number().min(0),
  catalystReductionPerLevel: z.number().min(0).max(1),
  thermalFeedbackRatePerLevel: z.number().min(0),
  volatileTuningMaxPerLevel: z.number().min(0).max(1),
  platingTransferRatePerLevel: z.number().min(0).max(1),
  phlembotinumPowerBase: z.number().min(0),
  phlembotinumHeatBase: z.number().min(0),
  phlembotinumMultiplier: z.number().min(1),
}).strict();
