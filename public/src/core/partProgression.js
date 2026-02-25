export function getPreviousTierSpec(part, partset) {
  if (!part) return null;
  if (part.level && part.level > 1) {
    return { type: part.type, level: part.level - 1, category: part.category };
  }
  const orderIdx = partset?.typeOrderIndex?.get(`${part.category}:${part.type}`);
  const typeOrder = partset?.categoryTypeOrder?.get(part.category) || [];
  if (typeof orderIdx !== 'number' || orderIdx <= 0) return null;
  const prevType = typeOrder[orderIdx - 1];
  const prevMaxLevel = Math.max(
    1,
    ...(partset?.getPartsByType(prevType)?.map((p) => p.level) || [1])
  );
  return { type: prevType, level: prevMaxLevel, category: part.category };
}

export function isFirstInChainSpec(spec, partset) {
  if (!spec) return false;
  const idx = partset?.typeOrderIndex?.get(`${spec.category}:${spec.type}`);
  return (idx === 0) && spec.level === 1;
}

export function isSpecUnlocked(spec, partset, getPlacedCount) {
  if (!spec) return false;
  const prev = getPreviousTierSpec({ type: spec.type, level: spec.level, category: spec.category }, partset);
  if (!prev) return true;
  return getPlacedCount(prev.type, prev.level) >= 10;
}

export function shouldShowPart(part, partset, getPlacedCount) {
  if (!part) return false;
  if (part.category === 'valve') return true;
  const prevSpec = getPreviousTierSpec(part, partset);
  if (!prevSpec) return true;
  if (isSpecUnlocked(prevSpec, partset, getPlacedCount)) return true;
  return false;
}

export function isPartUnlocked(part, ctx) {
  if (ctx.isSandbox) return true;
  if (ctx.partset?.isPartDoctrineLocked(part)) return false;
  if (!part || part.category === 'valve') {
    ctx.logger?.debug(`[UNLOCK] Part ${part?.id || 'null'}: Valve or null, unlocked by default.`);
    return true;
  }
  const prevSpec = getPreviousTierSpec(part, ctx.partset);
  if (!prevSpec) {
    ctx.logger?.debug(`[UNLOCK] Part '${part.id}' is a base part (no prerequisite). Unlocked by default.`);
    return true;
  }
  const count = ctx.getPlacedCount(prevSpec.type, prevSpec.level);
  const isUnlocked = count >= 10;
  const partId = part.id;
  const wasUnlocked = ctx._unlockStates[partId] || false;
  ctx._unlockStates[partId] = isUnlocked;
  ctx.logger?.debug(`[UNLOCK] Checking part '${part.id}': Requires 10 of '${prevSpec.type}:${prevSpec.level}'. Count: ${count}. Unlocked: ${isUnlocked}`);
  return isUnlocked;
}
