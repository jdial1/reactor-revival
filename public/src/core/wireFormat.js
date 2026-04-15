function isBufferLike(x) {
  return x instanceof ArrayBuffer || (typeof SharedArrayBuffer !== "undefined" && x instanceof SharedArrayBuffer);
}

export function safeParseGameLoopTickInput(msg) {
  try {
    if (!msg || typeof msg !== "object" || msg.type !== "tick") return { success: false };
    if (typeof msg.tickId !== "number" || msg.tickId < 1) return { success: false };
    if (typeof msg.tickCount !== "number" || msg.tickCount < 1) msg.tickCount = 1;
    if (!isBufferLike(msg.heatBuffer)) return { success: false };
    if (!Array.isArray(msg.partLayout) || !Array.isArray(msg.partTable)) return { success: false };
    if (!msg.reactorState || typeof msg.reactorState !== "object") return { success: false };
    if (typeof msg.rows !== "number" || msg.rows < 1 || typeof msg.cols !== "number" || msg.cols < 1) return { success: false };
    return { success: true, data: msg };
  } catch {
    return { success: false };
  }
}

export function safeParseGameLoopTickResult(data) {
  if (!data || typeof data !== "object" || typeof data.tickId !== "number") return { success: false };
  return { success: true, data };
}

export function safeParsePhysicsTickInput(msg) {
  try {
    if (!msg || typeof msg !== "object") return { success: false };
    if (!isBufferLike(msg.heatBuffer)) return { success: false };
    if (typeof msg.tickId !== "number" || msg.tickId < 0) return { success: false };
    return { success: true, data: msg };
  } catch {
    return { success: false };
  }
}

export function safeParsePhysicsTickResult(data) {
  if (!data || typeof data !== "object") return { success: false };
  return { success: true, data };
}
