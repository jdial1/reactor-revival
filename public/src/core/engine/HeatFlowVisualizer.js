export class HeatFlowVisualizer {
  constructor() {
    this._debug = [];
    this._pool = [];
  }

  clear() {
    for (let i = 0; i < this._debug.length; i++) this._pool.push(this._debug[i]);
    this._debug.length = 0;
  }

  addTransfer(fromIdx, toIdx, amount, cols) {
    const v = this._pool.pop() || { fromRow: 0, fromCol: 0, toRow: 0, toCol: 0, amount: 0 };
    v.fromRow = (fromIdx / cols) | 0;
    v.fromCol = fromIdx % cols;
    v.toRow = (toIdx / cols) | 0;
    v.toCol = toIdx % cols;
    v.amount = amount;
    this._debug.push(v);
  }

  getVectors() {
    return this._debug;
  }
}
