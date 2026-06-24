export const FRAGMENTATION_EXPLOSION_CHANCE = 0.12;

export const FRAGMENTATION_SALT_STRUCTURAL = 0xf1a9;
export const FRAGMENTATION_SALT_HULL_REPEL = 0x48e1;

function mixTickSalt(tick, salt) {
  let h = Math.imul((tick ^ salt) | 0, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 16), 0xc2b2ae35);
  return h >>> 0;
}

export function deterministicUnitInterval(tick, salt) {
  return mixTickSalt(tick, salt) / 4294967296;
}

export function deterministicChance(tick, salt, chance) {
  return deterministicUnitInterval(tick, salt) < chance;
}

export function deterministicPickIndex(tick, salt, count) {
  if (count <= 0) return -1;
  return mixTickSalt(tick, salt) % count;
}
