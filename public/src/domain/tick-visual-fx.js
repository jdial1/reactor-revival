import {
  MAX_VISUAL_EXPLOSION_FLASHES_PER_FRAME,
  MAX_VISUAL_REFLECTOR_PAIRS_PER_FRAME,
} from "../constants/balance.js";

const VISUAL_EVENT_POWER = 1;
const VISUAL_EVENT_HEAT = 2;

export function applyTickVisualFx(engine) {
  const ui = engine.game?.ui;
  const uiState = ui?.uiState;
  if (!uiState) {
    engine._reflectorPairCount = 0;
    engine._explosionFlashPending = 0;
    return;
  }
  const fx = [];
  const buf = engine.getEventBuffer?.();
  if (buf && buf.head !== buf.tail) {
    const { buffer, head, tail, max } = buf;
    let pos = tail;
    while (pos !== head) {
      const idx = pos * 2;
      const packed = buffer[idx];
      const typeId = (packed >> 12) & 0xF;
      const row = (packed >> 6) & 0x3F;
      const col = packed & 0x3F;
      if (typeId === VISUAL_EVENT_POWER) fx.push({ kind: "power", r: row, c: col });
      else if (typeId === VISUAL_EVENT_HEAT) fx.push({ kind: "heat", r: row, c: col });
      pos = (pos + 1) % max;
    }
    engine.ackEvents(head);
  }
  const nR = engine._reflectorPairCount | 0;
  if (nR > 0) {
    const b = engine._reflectorPairBuf;
    for (let i = 0; i < nR; i++) {
      const a = b[i * 2];
      const d = b[i * 2 + 1];
      fx.push({
        kind: "reflector",
        fromR: (a >>> 16) & 0xffff,
        fromC: a & 0xffff,
        toR: (d >>> 16) & 0xffff,
        toC: d & 0xffff,
      });
    }
  }
  const nE = engine._explosionFlashPending | 0;
  if (nE > 0) {
    for (let k = 0; k < nE; k++) fx.push({ kind: "explosion" });
  }
  engine._reflectorPairCount = 0;
  engine._explosionFlashPending = 0;
  if (!fx.length) return;
  if (!uiState.visual_fx) uiState.visual_fx = [];
  uiState.visual_fx.push(...fx);
}
