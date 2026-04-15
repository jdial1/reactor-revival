export const PARTS = {
  URANIUM: { id: 1, pBase: 1, hBase: 1, packM: 1, countC: 1, cost: 10, ticks: 15 },
  REFLECTOR: { id: 2, pBase: 0, hBase: 0, packM: 0, countC: 0, cost: 500, ticks: 100 },
  VENT: { id: 3, pBase: 0, hBase: 0, packM: 0, countC: 0, cost: 50, vent: 4 },
  EXCHANGER: { id: 4, pBase: 0, hBase: 0, packM: 0, countC: 0, cost: 160, transfer: 16 },
};

export function createGridSoA(rows, cols) {
  const size = rows * cols;
  const grid = {
    type: new Uint8Array(new SharedArrayBuffer(size)),
    heat: new Float64Array(new SharedArrayBuffer(size * 8)),
    containment: new Float64Array(new SharedArrayBuffer(size * 8)),
    pBase: new Float64Array(new SharedArrayBuffer(size * 8)),
    hBase: new Float64Array(new SharedArrayBuffer(size * 8)),
    packM: new Uint8Array(new SharedArrayBuffer(size)),
    countC: new Uint8Array(new SharedArrayBuffer(size)),
  };
  grid.containment.fill(1000);
  return grid;
}
