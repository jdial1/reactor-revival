import { BalanceConfigSchema } from "../schema/index.js";
import { SIM_CONSTANTS } from "../constants/sim.js";

export const BALANCE = BalanceConfigSchema.parse({
  valveTopupCapRatio: SIM_CONSTANTS.valveTopupThreshold,
  stirlingMultiplierPerLevel: 0.01,
  defaultCostMultiplier: 1.5,
  reflectorSellMultiplier: 1.5,
  cellSellMultiplier: 1.5,
  capacitorSellMultiplier: 10,
  powerThreshold10k: SIM_CONSTANTS.reactorHeatStandardDivisor,
  emergencyCoolantMultPerLevel: 0.005,
  reflectorCoolingFactorPerLevel: 0.02,
  manualOverrideMultPerLevel: 0.10,
  convectiveBoostPerLevel: 0.10,
  electroThermalBaseRatio: 2,
  electroThermalStep: 0.5,
  catalystReductionPerLevel: 0.05,
  thermalFeedbackRatePerLevel: 0.1,
  volatileTuningMaxPerLevel: 0.05,
  platingHeatBonusPerLevel: 0.05,
});
