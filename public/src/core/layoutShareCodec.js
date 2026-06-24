const SHARE_PREFIX = "rr1:";
const CODE_VERSION = 1;
const EMPTY_PART_INDEX = 0;

function buildCatalog(partset) {
  return Array.from(partset.parts.keys()).sort();
}

function catalogIndex(catalog, partId) {
  const idx = catalog.indexOf(partId);
  return idx >= 0 ? idx + 1 : EMPTY_PART_INDEX;
}

function catalogPartId(catalog, index) {
  if (!index || index <= 0) return null;
  return catalog[index - 1] ?? null;
}

function bytesToBase64Url(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  if (typeof btoa !== "function") return null;
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(str) {
  let b64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4) b64 += "=";
  if (typeof atob !== "function") return null;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function layoutToParts(layout) {
  const rows = layout.length;
  const cols = layout[0]?.length ?? 0;
  const parts = [];
  for (let r = 0; r < rows; r++) {
    const row = layout[r] || [];
    for (let c = 0; c < cols; c++) {
      const cell = row[c];
      if (cell?.id) parts.push({ r, c, id: cell.id, t: cell.t, lvl: cell.lvl || 1 });
    }
  }
  return { rows, cols, parts };
}

export function isLayoutShareCode(str) {
  return typeof str === "string" && str.startsWith(SHARE_PREFIX);
}

export function encodeLayoutShare(layout, partset) {
  if (!layout || !partset) return null;
  const { rows, cols, parts } = Array.isArray(layout[0])
    ? layoutToParts(layout)
    : { rows: layout.size?.rows ?? 0, cols: layout.size?.cols ?? 0, parts: layout.parts ?? [] };
  if (!rows || !cols) return null;
  const catalog = buildCatalog(partset);
  const cellCount = rows * cols;
  const bytes = new Uint8Array(3 + cellCount * 3);
  bytes[0] = CODE_VERSION;
  bytes[1] = rows;
  bytes[2] = cols;
  const sparse = new Map(parts.map((p) => [`${p.r},${p.c}`, p]));
  let offset = 3;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = sparse.get(`${r},${c}`);
      const partIdx = cell ? catalogIndex(catalog, cell.id) : EMPTY_PART_INDEX;
      const lvl = cell ? Math.min(255, Math.max(1, cell.lvl || 1)) : 0;
      bytes[offset] = partIdx & 0xff;
      bytes[offset + 1] = (partIdx >> 8) & 0xff;
      bytes[offset + 2] = lvl;
      offset += 3;
    }
  }
  return `${SHARE_PREFIX}${bytesToBase64Url(bytes)}`;
}

export function decodeLayoutShare(code, partset) {
  if (!isLayoutShareCode(code) || !partset) return null;
  const payload = code.slice(SHARE_PREFIX.length);
  let bytes;
  try {
    bytes = base64UrlToBytes(payload);
  } catch {
    return null;
  }
  if (!bytes.length || bytes[0] !== CODE_VERSION) return null;
  const rows = bytes[1];
  const cols = bytes[2];
  if (!rows || !cols) return null;
  const catalog = buildCatalog(partset);
  const parts = [];
  let offset = 3;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (offset + 2 >= bytes.length) return null;
      const partIdx = bytes[offset] | (bytes[offset + 1] << 8);
      const lvl = bytes[offset + 2];
      offset += 3;
      const partId = catalogPartId(catalog, partIdx);
      if (!partId) continue;
      const part = partset.getPartById(partId);
      if (!part) continue;
      parts.push({ r, c, id: part.id, t: part.type, lvl: lvl || 1 });
    }
  }
  return { size: { rows, cols }, parts };
}

export function shareCodeToLayoutGrid(code, partset) {
  const bp = decodeLayoutShare(code, partset);
  if (!bp) return null;
  const { rows, cols } = bp.size;
  const layout = Array.from({ length: rows }, () => Array.from({ length: cols }, () => null));
  bp.parts.forEach((p) => {
    if (p.r >= 0 && p.r < rows && p.c >= 0 && p.c < cols) {
      layout[p.r][p.c] = { id: p.id, t: p.t, lvl: p.lvl || 1 };
    }
  });
  return layout;
}
