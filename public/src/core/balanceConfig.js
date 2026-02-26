import { BalanceConfigSchema } from "./schemas.js";

const rawBalance = {
  valveTopupCapRatio: 0.2,
  autoSellMultiplierPerLevel: 0.01,
  stirlingMultiplierPerLevel: 0.01,
  defaultCostMultiplier: 1.5,
  reflectorSellMultiplier: 1.5,
  cellSellMultiplier: 1.5,
  powerThreshold10k: 10000,
  marketLobbyingMultPerLevel: 0.1,
  emergencyCoolantMultPerLevel: 0.005,
  reflectorCoolingFactorPerLevel: 0.02,
  insurancePercentPerLevel: 0.10,
  manualOverrideMultPerLevel: 0.10,
  convectiveBoostPerLevel: 0.10,
  electroThermalBaseRatio: 2,
  electroThermalStep: 0.5,
  catalystReductionPerLevel: 0.05,
  thermalFeedbackRatePerLevel: 0.1,
  volatileTuningMaxPerLevel: 0.05,
  platingTransferRatePerLevel: 0.05,
  phlembotinumPowerBase: 100,
  phlembotinumHeatBase: 1000,
  phlembotinumMultiplier: 4,
};

const result = BalanceConfigSchema.safeParse(rawBalance);
export const BALANCE = result.success ? result.data : rawBalance;
