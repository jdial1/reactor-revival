export class Performance {
  constructor(game) {
    this.game = game;
    this.enabled = false;
    this.marks = {};
    this.measures = {};
  }

  enable() {
    this.enabled = true;
  }

  disable() {
    this.enabled = false;
  }

  markStart(name) {
    if (!this.enabled) return;
    performance.mark(`${name}_start`);
    this.marks[name] = performance.now();
  }

  markEnd(name) {
    if (!this.enabled || !this.marks[name]) return;
    performance.mark(`${name}_end`);
    performance.measure(name, `${name}_start`, `${name}_end`);
    this.measures[name] = performance.now() - this.marks[name];
  }

  getMeasure(name) {
    return this.measures[name];
  }

  getAllMeasures() {
    return this.measures;
  }

  clearMarks() {
    this.marks = {};
    performance.clearMarks();
  }

  clearMeasures() {
    this.measures = {};
    performance.clearMeasures();
  }

  saveData() {
    return {
      marks: this.marks,
      measures: this.measures,
    };
  }

  loadData(data) {
    if (typeof data !== "object" || data === null || Array.isArray(data)) {
      throw new Error("Invalid data format for performance loading");
    }
    this.marks = data.marks || {};
    this.measures = data.measures || {};
  }

  reset() {
    this.enabled = false;
    this.marks = {};
    this.measures = {};
  }
}
