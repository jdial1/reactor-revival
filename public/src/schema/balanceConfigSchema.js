import { z } from "../../lib/zod.js";

export const BalanceConfigSchema = z.object({
  valveTopupCapRatio: z.number().min(0).max(1),
  stirlingMultiplierPerLevel: z.number().min(0),
  defaultCostMultiplier: z.number().min(1),
  reflectorSellMultiplier: z.number().min(0),
  cellSellMultiplier: z.number().min(0),
  capacitorSellMultiplier: z.number().min(0),
  powerThreshold10k: z.number().min(0),
  emergencyCoolantMultPerLevel: z.number().min(0),
  reflectorCoolingFactorPerLevel: z.number().min(0),
  manualOverrideMultPerLevel: z.number().min(0),
  convectiveBoostPerLevel: z.number().min(0),
  electroThermalBaseRatio: z.number().min(0),
  electroThermalStep: z.number().min(0),
  catalystReductionPerLevel: z.number().min(0).max(1),
  thermalFeedbackRatePerLevel: z.number().min(0),
  volatileTuningMaxPerLevel: z.number().min(0).max(1),
  platingHeatBonusPerLevel: z.number().min(0).max(1),
}).passthrough();

export const SimConstantsSchema = z.object({
  valveOverflowThreshold: z.number().min(0).max(1),
  valveTopupThreshold: z.number().min(0).max(1),
  criticalHeatRatio: z.number().min(0).max(1),
  reactorHeatStandardDivisor: z.number().min(1),
  heatTransferDiffDivisor: z.number().min(1),
}).passthrough();
