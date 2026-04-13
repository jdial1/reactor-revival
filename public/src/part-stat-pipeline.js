export const partStatMiddlewares = [];

export function registerPartStatMiddleware(fn) {
  if (typeof fn === "function") partStatMiddlewares.push(fn);
}

export function runPartStatMiddlewares(part, ctx) {
  for (let i = 0; i < partStatMiddlewares.length; i++) {
    partStatMiddlewares[i](part, ctx);
  }
}

export function snapshotPartStats(part) {
  return {
    power: part.power,
    heat: part.heat,
    containment: part.containment,
    transfer: part.transfer,
    vent: part.vent,
    ticks: part.ticks,
  };
}
