import { z } from "../../lib/zod.js";

export const TickEffectSchema = z.object({
  kind: z.string(),
}).passthrough();

export const TickResultSchema = z.object({
  stateDelta: z.record(z.unknown()).optional(),
  visualEvents: z
    .object({
      buffer: z.any().optional(),
      head: z.number().optional(),
      tail: z.number().optional(),
      max: z.number().optional(),
    })
    .optional(),
  sensoryMask: z.number().optional(),
  effects: z.array(TickEffectSchema).optional(),
  domainEvents: z.array(z.object({ name: z.string() }).passthrough()).optional(),
  reflectorPairs: z.instanceof(Uint32Array).optional(),
  reflectorPairCount: z.number().optional(),
  explosionFlashCount: z.number().optional(),
});

export function createEmptyTickResult() {
  return {
    stateDelta: {},
    visualEvents: null,
    sensoryMask: 0,
    effects: [],
    domainEvents: [],
    reflectorPairCount: 0,
    explosionFlashCount: 0,
  };
}

export function mergeTickEffects(result, effects) {
  if (!effects?.length) return result;
  result.effects = (result.effects ?? []).concat(effects);
  return result;
}

export function buildTickPresentationResult(engine) {
  if (!engine) return null;
  const result = {};
  const buf = engine.getEventBuffer?.();
  if (buf && buf.head !== buf.tail) {
    result.visualEvents = {
      buffer: buf.buffer,
      head: buf.head,
      tail: buf.tail,
      max: buf.max,
    };
  }
  const nR = engine._reflectorPairCount | 0;
  if (nR > 0) {
    result.reflectorPairCount = nR;
    result.reflectorPairs = engine._reflectorPairBuf;
  }
  const nE = engine._explosionFlashPending | 0;
  if (nE > 0) result.explosionFlashCount = nE;
  if (!result.visualEvents && !result.reflectorPairCount && !result.explosionFlashCount) return null;
  return result;
}

import { applyTickVisualFx } from "./tick-visual-fx.js";

export function publishTickPresentation(engine) {
  applyTickVisualFx(engine);
}
