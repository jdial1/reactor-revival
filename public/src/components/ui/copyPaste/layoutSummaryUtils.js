export function buildPartSummary(partset, layout) {
  if (!partset || !layout) return [];
  const cells = layout.flatMap((row) => row || []).filter((cell) => cell && cell.id);
  const summary = cells.reduce((acc, cell) => {
    const key = `${cell.id}|${cell.lvl || 1}`;
    if (!acc[key]) {
      const part = partset.parts.get(cell.id);
      acc[key] = {
        id: cell.id,
        type: cell.t,
        lvl: cell.lvl || 1,
        title: part ? part.title : cell.id,
        unitPrice: part ? part.cost : 0,
        count: 0,
        total: 0,
      };
    }
    acc[key].count++;
    acc[key].total += acc[key].unitPrice;
    return acc;
  }, {});
  return Object.values(summary);
}

export function buildAffordableSet(affordableLayout) {
  if (!affordableLayout) return new Set();
  const keys = affordableLayout.flatMap((row, r) => (row || []).map((cell, c) => cell ? `${r},${c}` : null).filter(Boolean));
  return new Set(keys);
}
