import { BALANCE } from "../balanceConfig.js";
import { HEAT_TRANSFER_DIFF_DIVISOR, EXCHANGER_MIN_TRANSFER_UNIT } from "../constants.js";

export const VALVE_OVERFLOW = 1;
export const VALVE_TOPUP = 2;
export const VALVE_CHECK = 3;
export const CATEGORY_EXCHANGER = 0;
export const CATEGORY_OTHER = 1;
export const CATEGORY_VENT_COOLANT = 2;

export function canPushToNeighbor(heatStart, nStart, cat) {
  return heatStart > nStart || (cat === CATEGORY_VENT_COOLANT && heatStart === nStart && heatStart > 0);
}

export function transferHeatBetweenNeighbors(heatStart, nStart, cap, cat, transferVal, totalHeadroom, remainingPush) {
  if (remainingPush <= 0 || !canPushToNeighbor(heatStart, nStart, cat)) return 0;
  const diff = Math.max(0, heatStart - nStart) || EXCHANGER_MIN_TRANSFER_UNIT;
  const headroom = Math.max(cap - nStart, 0);
  const bias = Math.max(headroom / totalHeadroom, 0);
  return Math.min(
    Math.max(EXCHANGER_MIN_TRANSFER_UNIT, Math.floor(transferVal * bias)),
    Math.ceil(diff / HEAT_TRANSFER_DIFF_DIVISOR),
    remainingPush
  );
}

export function applyValveRule(heat, containment, val, multiplier, recordTransfers) {
  const inputIdx = val.inputIdx;
  const outputIdx = val.outputIdx;
  if (inputIdx < 0 || outputIdx < 0) return;
  const inputHeat = heat[inputIdx] || 0;
  if (inputHeat <= 0) {
    heat[val.index] = 0;
    return;
  }
  const outputCap = containment[outputIdx] || 1;
  const outputHeat = heat[outputIdx] || 0;
  const outputSpace = Math.max(0, outputCap - outputHeat);
  if (outputSpace <= 0) {
    heat[val.index] = 0;
    return;
  }
  let maxTransfer = val.transferRate * multiplier;
  if (val.type === VALVE_TOPUP) maxTransfer = Math.min(maxTransfer, outputCap * BALANCE.valveTopupCapRatio);
  const transfer = Math.min(maxTransfer, inputHeat, outputSpace);
  if (transfer > 0) {
    heat[inputIdx] -= transfer;
    heat[outputIdx] = (heat[outputIdx] || 0) + transfer;
    if (recordTransfers) recordTransfers.push({ fromIdx: inputIdx, toIdx: outputIdx, amount: transfer });
  }
  heat[val.index] = 0;
}
