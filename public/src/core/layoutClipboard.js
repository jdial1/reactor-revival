export function tryParseBlueprintData(data) {
  if (!data || typeof data !== "object") return null;
  const { size, parts } = data;
  if (!size || typeof size.rows !== "number" || typeof size.cols !== "number" || !Array.isArray(parts)) return null;
  for (const p of parts) {
    if (!p || typeof p.r !== "number" || typeof p.c !== "number" || typeof p.t !== "string" || typeof p.id !== "string") return null;
  }
  return data;
}

export function tryParseLegacyGridLayout(data) {
  if (!Array.isArray(data) || data.length < 1) return null;
  if (!Array.isArray(data[0])) return null;
  return data;
}
