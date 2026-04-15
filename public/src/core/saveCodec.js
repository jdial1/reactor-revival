export const SAVE_FORMAT_VERSION_LATEST = 2;

function bytesToBase64(bytes) {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToBytes(b64) {
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(b64, "base64"));
  }
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export function buildPartTable(partset) {
  if (!partset?.partsArray?.length) {
    return { part_table: [""], idToIndex: new Map([["", 0]]) };
  }
  const ids = [...new Set(partset.partsArray.map((p) => p.id))].sort();
  const part_table = ["", ...ids];
  const idToIndex = new Map();
  part_table.forEach((id, i) => idToIndex.set(id, i));
  return { part_table, idToIndex };
}

export function encodeTilesCompact(tileList, rows, cols, idToIndex) {
  const n = rows * cols;
  const idBytes = new Uint8Array(n * 2);
  const tickBytes = new Uint8Array(n * 4);
  const heatBytes = new Uint8Array(n * 4);
  const idDv = new DataView(idBytes.buffer);
  const tickDv = new DataView(tickBytes.buffer);
  const heatDv = new DataView(heatBytes.buffer);
  for (let i = 0; i < n; i++) {
    idDv.setUint16(i * 2, 0, true);
    tickDv.setFloat32(i * 4, 0, true);
    heatDv.setFloat32(i * 4, 0, true);
  }
  for (const t of tileList || []) {
    const r = t.row;
    const c = t.col;
    if (r == null || c == null || r < 0 || c < 0 || r >= rows || c >= cols) continue;
    const idx = r * cols + c;
    const pid = t.partId ?? t.id;
    if (!pid) continue;
    const pi = idToIndex.get(pid);
    if (pi == null || pi === 0) continue;
    idDv.setUint16(idx * 2, pi, true);
    tickDv.setFloat32(idx * 4, Number(t.ticks) || 0, true);
    heatDv.setFloat32(idx * 4, Number(t.heat_contained) || 0, true);
  }
  return {
    encoding: "u16_f32f32",
    rows,
    cols,
    ids_b64: bytesToBase64(idBytes),
    ticks_b64: bytesToBase64(tickBytes),
    heat_b64: bytesToBase64(heatBytes),
  };
}

export function decodeTilesCompact(tiles_compact, part_table) {
  if (!tiles_compact || tiles_compact.encoding !== "u16_f32f32") return [];
  const { rows, cols, ids_b64, ticks_b64, heat_b64 } = tiles_compact;
  if (!rows || !cols || !ids_b64 || !ticks_b64 || !heat_b64 || !part_table?.length) return [];
  const n = rows * cols;
  const idBytes = base64ToBytes(ids_b64);
  const tickBytes = base64ToBytes(ticks_b64);
  const heatBytes = base64ToBytes(heat_b64);
  if (idBytes.byteLength < n * 2 || tickBytes.byteLength < n * 4 || heatBytes.byteLength < n * 4) return [];
  const idDv = new DataView(idBytes.buffer, idBytes.byteOffset, n * 2);
  const tickDv = new DataView(tickBytes.buffer, tickBytes.byteOffset, n * 4);
  const heatDv = new DataView(heatBytes.buffer, heatBytes.byteOffset, n * 4);
  const out = [];
  for (let i = 0; i < n; i++) {
    const pi = idDv.getUint16(i * 2, true);
    if (!pi) continue;
    const partId = part_table[pi];
    if (!partId) continue;
    const row = (i / cols) | 0;
    const col = i % cols;
    out.push({
      row,
      col,
      partId,
      ticks: tickDv.getFloat32(i * 4, true) || 0,
      heat_contained: heatDv.getFloat32(i * 4, true) || 0,
    });
  }
  return out;
}
