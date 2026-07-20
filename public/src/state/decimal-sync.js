import { toNumber } from "../simUtils.js";

export function setDecimal(state, key, value) {
  if (state?._simulationLocked && (key === "current_money" || key === "current_exotic_particles")) {
    return;
  }
  state[key] = toNumber(value);
}
