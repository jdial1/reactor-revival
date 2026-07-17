export function getActiveBridge(bridgeOrGame) {
  const bridge = bridgeOrGame?.coreBridge ?? bridgeOrGame;
  return bridge?.isActive ? bridge : null;
}

export function requireActiveBridge(bridgeOrGame, label = "operation") {
  const bridge = getActiveBridge(bridgeOrGame);
  if (!bridge) throw new Error(`${label} requires an active core session`);
  return bridge;
}
