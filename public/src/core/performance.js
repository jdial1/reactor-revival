// Check if we're in a test environment or debugging mode
// In browser, process is undefined, so we need a fallback
const DEBUG_PERFORMANCE =
  (typeof process !== "undefined" && process.env?.NODE_ENV === "test") ||
  (typeof window !== "undefined" &&
    window.location?.hostname === "localhost") ||
  false;

export class Performance {
  constructor(game) {
    this.game = game;
    this.enabled = false;
    this.marks = {};
    this.measures = {};
    this.counters = {};
    this.averages = {};
    this.lastDisplayTime = 0;
    this.displayInterval = 120000; // Show stats every 2 minutes instead of 30 seconds
    this.sampleCount = 0;
    this.maxSamples = 100; // Keep last 100 samples for averages
    this.quietMode = true; // Enable quiet mode by default to reduce console spam
    this.lastQuietMessage = 0; // Track when we last showed a quiet message
    this.quietMessageInterval = 300000; // Show quiet message every 5 minutes
  }

  enable() {
    if (!DEBUG_PERFORMANCE) return;
    this.enabled = true;
    this.startPeriodicDisplay();
  }

  disable() {
    this.enabled = false;
    this.stopPeriodicDisplay();
  }

  // New method to enable quiet mode (less console spam)
  enableQuietMode() {
    this.quietMode = true;
  }

  // New method to disable quiet mode
  disableQuietMode() {
    this.quietMode = false;
  }

  // New method to get current performance monitoring status
  getStatus() {
    return {
      enabled: this.enabled,
      quietMode: this.quietMode,
      displayInterval: this.displayInterval,
      quietMessageInterval: this.quietMessageInterval,
      maxSamples: this.maxSamples
    };
  }

  // Convenience method to check if performance monitoring should be used
  shouldMeasure() {
    return this.enabled && DEBUG_PERFORMANCE;
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
    const duration = performance.now() - this.marks[name];
    this.measures[name] = duration;

    // Track averages
    if (!this.averages[name]) {
      this.averages[name] = { sum: 0, count: 0, samples: [] };
    }
    this.averages[name].sum += duration;
    this.averages[name].count++;
    this.averages[name].samples.push(duration);

    // Keep only recent samples
    if (this.averages[name].samples.length > this.maxSamples) {
      const removed = this.averages[name].samples.shift();
      this.averages[name].sum -= removed;
    }

    // Track counters
    this.counters[name] = (this.counters[name] || 0) + 1;
  }

  getMeasure(name) {
    return this.measures[name];
  }

  getAverage(name) {
    const avg = this.averages[name];
    return avg ? avg.sum / avg.count : 0;
  }

  getMax(name) {
    const avg = this.averages[name];
    return avg && avg.samples.length > 0 ? Math.max(...avg.samples) : 0;
  }

  getMin(name) {
    const avg = this.averages[name];
    return avg && avg.samples.length > 0 ? Math.min(...avg.samples) : 0;
  }

  getCount(name) {
    return this.counters[name] || 0;
  }

  getAllMeasures() {
    return this.measures;
  }

  getAllAverages() {
    const result = {};
    for (const [name, avg] of Object.entries(this.averages)) {
      result[name] = {
        average: avg.sum / avg.count,
        max: Math.max(...avg.samples),
        min: Math.min(...avg.samples),
        count: avg.count,
        samples: avg.samples.length,
      };
    }
    return result;
  }

  clearMarks() {
    this.marks = {};
    performance.clearMarks();
  }

  clearMeasures() {
    this.measures = {};
    this.averages = {};
    this.counters = {};
    performance.clearMeasures();
  }

  saveData() {
    return {
      marks: this.marks,
      measures: this.measures,
      averages: this.averages,
      counters: this.counters,
    };
  }

  loadData(data) {
    if (typeof data !== "object" || data === null || Array.isArray(data)) {
      throw new Error("Invalid data format for performance loading");
    }
    this.marks = data.marks || {};
    this.measures = data.measures || {};
    this.averages = data.averages || {};
    this.counters = data.counters || {};
  }

  reset() {
    this.enabled = false;
    this.marks = {};
    this.measures = {};
    this.averages = {};
    this.counters = {};
    this.sampleCount = 0;
  }

  startPeriodicDisplay() {
    if (this.displayInterval) {
      this.displayTimer = setInterval(() => {
        this.displayPerformanceStats();
      }, this.displayInterval);
    }
  }

  stopPeriodicDisplay() {
    if (this.displayTimer) {
      clearInterval(this.displayTimer);
      this.displayTimer = null;
    }
  }

  displayPerformanceStats() {
    if (!this.enabled || !DEBUG_PERFORMANCE) return;

    const now = performance.now();
    if (now - this.lastDisplayTime < this.displayInterval) return;
    this.lastDisplayTime = now;

    const stats = this.getAllAverages();
    const significantStats = {};

    // Filter for significant operations (>2ms average or >15ms max or >50 count)
    // Increased thresholds to reduce noise
    for (const [name, data] of Object.entries(stats)) {
      if (data.average > 2 || data.max > 15 || data.count > 50) {
        significantStats[name] = data;
      }
    }

    if (Object.keys(significantStats).length === 0) {
      // Only show quiet message occasionally to reduce spam
      if (!this.quietMode || (now - this.lastQuietMessage) > this.quietMessageInterval) {
        console.log("🎯 Performance: All operations within normal thresholds");
        this.lastQuietMessage = now;
      }
      return;
    }

    console.group("🎯 Performance Report");
    console.log(`📊 Sample period: ${this.displayInterval}ms`);

    // Sort by average time (descending)
    const sortedStats = Object.entries(significantStats).sort(
      ([, a], [, b]) => b.average - a.average
    );

    for (const [name, data] of sortedStats) {
      const emoji = this.getPerformanceEmoji(data.average, data.max);
      console.log(
        `${emoji} ${name}:`,
        `avg: ${data.average.toFixed(2)}ms,`,
        `max: ${data.max.toFixed(2)}ms,`,
        `min: ${data.min.toFixed(2)}ms,`,
        `count: ${data.count}`
      );
    }

    // Check for potential issues
    const issues = this.detectPerformanceIssues(significantStats);
    if (issues.length > 0) {
      console.group("⚠️ Potential Issues:");
      issues.forEach((issue) => console.log(issue));
      console.groupEnd();
    }

    console.groupEnd();
  }

  getPerformanceEmoji(average, max) {
    if (average > 50 || max > 100) return "🔴";
    if (average > 20 || max > 50) return "🟡";
    if (average > 5 || max > 20) return "🟠";
    return "🟢";
  }

  detectPerformanceIssues(stats) {
    const issues = [];

    for (const [name, data] of Object.entries(stats)) {
      if (data.average > 50) {
        issues.push(
          `${name}: Very slow average (${data.average.toFixed(2)}ms)`
        );
      }
      if (data.max > 100) {
        issues.push(`${name}: Very slow peak (${data.max.toFixed(2)}ms)`);
      }
      if (data.count > 1000) {
        issues.push(`${name}: Very frequent (${data.count} calls)`);
      }
    }

    return issues;
  }

  // Quick performance check for specific operations
  quickCheck(name, threshold = 15) { // Increased default threshold
    const avg = this.getAverage(name);
    const max = this.getMax(name);
    const count = this.getCount(name);

    if (avg > threshold || max > threshold * 2) {
      console.warn(
        `⚠️ Performance issue detected in ${name}: avg=${avg.toFixed(
          2
        )}ms, max=${max.toFixed(2)}ms, count=${count}`
      );
      return false;
    }
    return true;
  }

  // New method to get a summary of current performance
  getPerformanceSummary() {
    if (!this.enabled) return null;

    const stats = this.getAllAverages();
    const summary = {
      totalOperations: Object.keys(stats).length,
      slowOperations: 0,
      verySlowOperations: 0,
      totalCalls: 0
    };

    for (const [, data] of Object.entries(stats)) {
      summary.totalCalls += data.count;
      if (data.average > 5) summary.slowOperations++;
      if (data.average > 20) summary.verySlowOperations++;
    }

    return summary;
  }

  // New method to log performance summary to console
  logPerformanceSummary() {
    if (!this.enabled || !DEBUG_PERFORMANCE) return;

    const summary = this.getPerformanceSummary();
    if (!summary) return;

    console.log("📊 Performance Summary:", summary);
  }
}
