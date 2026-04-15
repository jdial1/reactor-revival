export const TraitBitmask = {
  NONE: 0,
  FUEL_CELL: 1 << 0,
  VALVE_UNIT: 1 << 1,
  VALVE_OVERFLOW: 1 << 2,
  VALVE_TOPUP: 1 << 3,
  HEAT_INLET: 1 << 4,
  VENT: 1 << 5,
  COOLANT_CELL: 1 << 6,
  HEAT_EXCHANGER: 1 << 7,
  HEAT_OUTLET: 1 << 8,
  REFLECTOR: 1 << 9,
  PARTICLE_ACCELERATOR: 1 << 10,
  CAPACITOR: 1 << 11,
};

export function compileTraitBitmask(traitsArray) {
  if (!Array.isArray(traitsArray)) return TraitBitmask.NONE;
  let mask = TraitBitmask.NONE;
  for (const trait of traitsArray) {
    if (TraitBitmask[trait]) {
      mask |= TraitBitmask[trait];
    }
  }
  return mask;
}

export function hasTrait(mask, traitName) {
  const bit = TraitBitmask[traitName];
  if (!bit) return false;
  return (mask & bit) !== 0;
}
