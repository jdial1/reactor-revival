import { SimConstantsSchema } from "../schema/balanceConfigSchema.js";

export const SIM_CONSTANTS = SimConstantsSchema.parse({
  valveOverflowThreshold: 0.8,
  valveTopupThreshold: 0.2,
  criticalHeatRatio: 0.85,
  reactorHeatStandardDivisor: 10000,
  heatTransferDiffDivisor: 2,
});

export const VALVE_OVERFLOW_THRESHOLD = SIM_CONSTANTS.valveOverflowThreshold;
export const VALVE_TOPUP_THRESHOLD = SIM_CONSTANTS.valveTopupThreshold;
export const CRITICAL_HEAT_RATIO = SIM_CONSTANTS.criticalHeatRatio;
export const REACTOR_HEAT_STANDARD_DIVISOR = SIM_CONSTANTS.reactorHeatStandardDivisor;
export const HEAT_TRANSFER_DIFF_DIVISOR = SIM_CONSTANTS.heatTransferDiffDivisor;
