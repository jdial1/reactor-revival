export function withHostEconomyHydrate(game, fn) {
  if (!game) return fn();
  game._hostEconomyWrite = (game._hostEconomyWrite | 0) + 1;
  try {
    return fn();
  } finally {
    game._hostEconomyWrite = Math.max(0, (game._hostEconomyWrite | 0) - 1);
  }
}

export function assertHostEconomyWrite(game, label) {
  if (game?._hostEconomyWrite || game?._isRestoringSave) return;
  if (typeof process !== "undefined" && process.env?.VITEST) return;
  throw new Error(`Host economy write outside hydrate: ${label}`);
}
