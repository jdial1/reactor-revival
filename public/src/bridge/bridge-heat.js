export function getHeatSegmentForTile(bridge, tile) {
  if (!tile || !bridge?.session?.getHeatSegmentAt) return null;
  const seg = bridge.session.getHeatSegmentAt(tile.row, tile.col);
  if (!seg) return null;
  const tileset = bridge.game?.tileset;
  const components = [];
  const vents = [];
  const outlets = [];
  const inlets = [];
  const tiles = seg.tiles || [];
  for (let i = 0; i < tiles.length; i++) {
    const node = tiles[i];
    const t = tileset?.getTile(node.row, node.col);
    if (!t?.part) continue;
    components.push(t);
    if (node.category === "vent") vents.push(t);
    else if (node.category === "heat_outlet") outlets.push(t);
    else if (node.category === "heat_inlet") inlets.push(t);
  }
  return {
    components,
    vents,
    outlets,
    inlets,
    fullnessRatio: seg.fullnessRatio ?? 0,
    totalHeat: seg.totalHeat ?? 0,
    totalContainment: seg.totalContainment ?? 0,
    totalVentRate: seg.totalVentRate ?? 0,
    totalTransferRate: seg.totalTransferRate ?? 0,
    totalOutletRate: seg.totalOutletRate ?? 0,
    totalInletRate: seg.totalInletRate ?? 0,
  };
}

export function inspectExchangerPressureFlow(bridge, tile) {
  if (!tile?.part || !bridge?.session?.getTileFlowDiagnostics) return null;
  const diag = bridge.session.getTileFlowDiagnostics(tile.row, tile.col);
  return diag?.summary ?? null;
}
