/**
 * Physics Kernel - Centralized physics calculations
 * 
 * This module contains pure mathematical functions for reactor physics.
 * Both the main thread (logic.js) and Web Workers should import from here
 * to ensure consistency when formulas change.
 */

/**
 * Calculate Neutron Pulse Power
 * Power = coefficient * (M + N)
 * Where M = cell pack multiplier, N = neighbor pulse count
 * 
 * @param {number} coefficient - Base power coefficient
 * @param {number} M - Cell pack multiplier
 * @param {number} N - Neighbor pulse count
 * @returns {number} Pulse power
 */
export function calculateNeutronPulsePower(coefficient, M, N) {
  return coefficient * (M + N);
}

/**
 * Calculate Quadratic Heat
 * Heat = Hbase * (M + N)² / C
 * Where M = cell pack multiplier, N = neighbor pulse count, C = cell count
 * 
 * @param {number} Hbase - Base heat value
 * @param {number} M - Cell pack multiplier
 * @param {number} N - Neighbor pulse count
 * @param {number} C - Cell count (default 1 to avoid division by zero)
 * @returns {number} Quadratic heat value
 */
export function calculateQuadraticHeat(Hbase, M, N, C) {
  const pulse = M + N;
  return (Hbase * pulse * pulse) / Math.max(1, C);
}

/**
 * Apply reflector cooling effects
 * Reduces heat based on adjacent reflector count
 * 
 * @param {number} tileHeat - Current tile heat
 * @param {number} reflectorCount - Number of active reflector neighbors
 * @param {number} coolingFactor - Cooling factor per reflector
 * @param {number} minMultiplier - Minimum heat multiplier (floor)
 * @returns {number} Adjusted heat value
 */
export function applyReflectorCooling(tileHeat, reflectorCount, coolingFactor, minMultiplier = 0.2) {
  if (reflectorCount <= 0 || coolingFactor <= 0) return tileHeat;
  const coolingReduction = reflectorCount * coolingFactor;
  const heatMult = Math.max(minMultiplier, 1 - coolingReduction);
  return tileHeat * heatMult;
}

/**
 * Calculate heat-power multiplier based on reactor heat levels
 * Used for scaling cell output based on current reactor heat
 * 
 * @param {number} heatPowerMultiplier - Base multiplier factor
 * @param {number} currentHeat - Current reactor heat (numeric)
 * @param {number} logBase - Logarithm base (default 1000)
 * @param {number} logCap - Maximum heat for log calc (default 1e100)
 * @param {number} percentDivisor - Divisor for percentage conversion (default 100)
 * @returns {number} Multiplier value (1 + scaled factor)
 */
export function calculateHeatPowerMultiplier(
  heatPowerMultiplier,
  currentHeat,
  logBase = 1000,
  logCap = 1e100,
  percentDivisor = 100
) {
  if (!heatPowerMultiplier || heatPowerMultiplier <= 0) return 1;
  if (!currentHeat || currentHeat <= 0) return 1;
  
  const heatNum = Math.min(currentHeat, logCap);
  const mult = 1 + heatPowerMultiplier * (Math.log(heatNum) / Math.log(logBase) / percentDivisor);
  
  return Number.isFinite(mult) && mult > 0 ? mult : 1;
}