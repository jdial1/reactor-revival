import { SimConstantsSchema } from "../schema/balanceConfigSchema.js";

export const SIM_CONSTANTS = SimConstantsSchema.parse({
  valveOverflowThreshold: 0.8,
  valveTopupThreshold: 0.2,
  heatEpsilon: 0.001,
  meltdownHeatMultiplier: 2,
  criticalHeatRatio: 0.85,
  reactorHeatStandardDivisor: 10000,
  heatPayloadMaxInlets: 32,
  heatPayloadMaxValves: 32,
  heatPayloadMaxValveNeighbors: 256,
  heatPayloadMaxExchangers: 64,
  heatPayloadMaxOutlets: 32,
  heatTransferMaxIterations: 10000,
  hullRepelFraction: 0.05,
  heatTransferDiffDivisor: 2,
  exchangerMinHeadroom: 1,
  exchangerMinTransferUnit: 1,
});

export const VALVE_OVERFLOW_THRESHOLD = SIM_CONSTANTS.valveOverflowThreshold;
export const VALVE_TOPUP_THRESHOLD = SIM_CONSTANTS.valveTopupThreshold;
export const HEAT_EPSILON = SIM_CONSTANTS.heatEpsilon;
export const MELTDOWN_HEAT_MULTIPLIER = SIM_CONSTANTS.meltdownHeatMultiplier;
export const CRITICAL_HEAT_RATIO = SIM_CONSTANTS.criticalHeatRatio;
export const REACTOR_HEAT_STANDARD_DIVISOR = SIM_CONSTANTS.reactorHeatStandardDivisor;
export const HEAT_PAYLOAD_MAX_INLETS = SIM_CONSTANTS.heatPayloadMaxInlets;
export const HEAT_PAYLOAD_MAX_VALVES = SIM_CONSTANTS.heatPayloadMaxValves;
export const HEAT_PAYLOAD_MAX_VALVE_NEIGHBORS = SIM_CONSTANTS.heatPayloadMaxValveNeighbors;
export const HEAT_PAYLOAD_MAX_EXCHANGERS = SIM_CONSTANTS.heatPayloadMaxExchangers;
export const HEAT_PAYLOAD_MAX_OUTLETS = SIM_CONSTANTS.heatPayloadMaxOutlets;
export const HEAT_TRANSFER_MAX_ITERATIONS = SIM_CONSTANTS.heatTransferMaxIterations;
export const HULL_REPEL_FRACTION = SIM_CONSTANTS.hullRepelFraction;
export const HEAT_TRANSFER_DIFF_DIVISOR = SIM_CONSTANTS.heatTransferDiffDivisor;
export const EXCHANGER_MIN_HEADROOM = SIM_CONSTANTS.exchangerMinHeadroom;
export const EXCHANGER_MIN_TRANSFER_UNIT = SIM_CONSTANTS.exchangerMinTransferUnit;
