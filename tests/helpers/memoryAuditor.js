export class MemoryAuditor {
  constructor() {
    this.previousStats = null;
    this.statsHistory = [];
    this.debug = false;
  }

  reset() {
    this.previousStats = null;
    this.statsHistory = [];
    this.debug = false;
  }

  formatMB(bytes) {
    return (bytes / 1024 / 1024).toFixed(2);
  }

  log(label = "Heap Stats") {
    try {
      if (typeof process !== "undefined" && process.memoryUsage) {
        const usage = process.memoryUsage();
        const formatMB = (b) => this.formatMB(b);
        const stats = {
          rss: usage.rss,
          heapTotal: usage.heapTotal,
          heapUsed: usage.heapUsed,
          external: usage.external,
          arrayBuffers: usage.arrayBuffers || 0,
        };
        const heapUsedPercent = ((stats.heapUsed / stats.heapTotal) * 100).toFixed(1);
        const rssPercent = stats.heapTotal > 0 ? ((stats.heapTotal / stats.rss) * 100).toFixed(1) : "0";
        const freeHeap = stats.heapTotal - stats.heapUsed;
        let changeStr = "";
        if (this.previousStats) {
          const rssDelta = stats.rss - this.previousStats.rss;
          const heapTotalDelta = stats.heapTotal - this.previousStats.heapTotal;
          const heapUsedDelta = stats.heapUsed - this.previousStats.heapUsed;
          const externalDelta = stats.external - this.previousStats.external;
          const arrayBuffersDelta = stats.arrayBuffers - this.previousStats.arrayBuffers;
          const rssDeltaMB = formatMB(rssDelta);
          const heapTotalDeltaMB = formatMB(heapTotalDelta);
          const heapUsedDeltaMB = formatMB(heapUsedDelta);
          const externalDeltaMB = formatMB(externalDelta);
          const arrayBuffersDeltaMB = formatMB(arrayBuffersDelta);
          const heapShrunk = heapTotalDelta < -10 * 1024 * 1024;
          const largeRSSDrop = rssDelta < -50 * 1024 * 1024;
          changeStr =
            `\n  CHANGES since last measurement:\n` +
            `    RSS: ${rssDelta >= 0 ? "+" : ""}${rssDeltaMB} MB ${largeRSSDrop ? "⚠️ MAJOR GC EVENT" : ""}\n` +
            `    Heap Total: ${heapTotalDelta >= 0 ? "+" : ""}${heapTotalDeltaMB} MB ${heapShrunk ? "⚠️⚠️ HEAP SHRUNK!" : ""}\n` +
            `    Heap Used: ${heapUsedDelta >= 0 ? "+" : ""}${heapUsedDeltaMB} MB\n` +
            `    External: ${externalDelta >= 0 ? "+" : ""}${externalDeltaMB} MB\n` +
            `    ArrayBuffers: ${arrayBuffersDelta >= 0 ? "+" : ""}${arrayBuffersDeltaMB} MB\n`;
          if (heapShrunk) {
            changeStr += `    ⚠️⚠️⚠️ CRITICAL: Heap shrunk by ${Math.abs(parseFloat(heapTotalDeltaMB))} MB - OOM risk HIGH!\n`;
            changeStr += `    ⚠️⚠️⚠️ Heap size reduced from ${formatMB(this.previousStats.heapTotal)} MB to ${formatMB(stats.heapTotal)} MB\n`;
          }
          if (largeRSSDrop && heapShrunk) {
            changeStr += `    ⚠️⚠️⚠️ AGGRESSIVE GC: RSS dropped ${Math.abs(parseFloat(rssDeltaMB))} MB and heap shrunk - memory pressure detected!\n`;
          }
        }
        let warningStr = "";
        if (parseFloat(heapUsedPercent) > 85) {
          warningStr = `\n  ⚠️⚠️⚠️ CRITICAL: Heap usage at ${heapUsedPercent}% - Only ${formatMB(freeHeap)} MB free!\n`;
        } else if (parseFloat(heapUsedPercent) > 75) {
          warningStr = `\n  ⚠️ WARNING: Heap usage at ${heapUsedPercent}% - Monitor closely\n`;
        }
        this.previousStats = stats;
        this.statsHistory.push({
          label,
          timestamp: Date.now(),
          rss: stats.rss,
          heapTotal: stats.heapTotal,
          heapUsed: stats.heapUsed,
          heapUsedPercent: parseFloat(heapUsedPercent),
          freeHeap: freeHeap,
        });
        if (this.debug) {
          const statsStr =
            `\n[${label}]\n` +
            `  RSS: ${formatMB(stats.rss)} MB (total allocated)\n` +
            `  Heap: ${formatMB(stats.heapUsed)} / ${formatMB(stats.heapTotal)} MB (${heapUsedPercent}% used)\n` +
            `  External: ${formatMB(stats.external)} MB\n` +
            `  ArrayBuffers: ${formatMB(stats.arrayBuffers)} MB\n` +
            `  Heap/RSS Ratio: ${rssPercent}%\n` +
            `  Estimated Free Heap: ${formatMB(freeHeap)} MB\n` +
            changeStr +
            warningStr;
          process.stderr.write(statsStr);
          console.error(statsStr.trim());
          if (process.stdout && typeof process.stdout.write === "function") {
            process.stdout.write("");
          }
        }
        return stats;
      }
    } catch (error) {
      if (this.debug) {
        try {
          const errorStr = `[${label}] ERROR getting heap stats: ${error.message}\n`;
          process.stderr.write(errorStr);
          console.error(errorStr.trim());
        } catch (_) {}
      }
    }
    return null;
  }

  printSummary() {
    if (!this.debug) {
      return;
    }
    if (this.statsHistory.length === 0) {
      return;
    }
    const formatMB = (b) => this.formatMB(b);
    process.stderr.write("\n" + "=".repeat(80) + "\n");
    process.stderr.write("MEMORY USAGE SUMMARY\n");
    process.stderr.write("=".repeat(80) + "\n");
    const criticalEvents = [];
    for (let i = 1; i < this.statsHistory.length; i++) {
      const prev = this.statsHistory[i - 1];
      const curr = this.statsHistory[i];
      const heapDelta = curr.heapTotal - prev.heapTotal;
      const rssDelta = curr.rss - prev.rss;
      if (heapDelta < -10 * 1024 * 1024) {
        criticalEvents.push({
          label: curr.label,
          type: "HEAP_SHRINK",
          heapShrinkMB: formatMB(Math.abs(heapDelta)),
          fromMB: formatMB(prev.heapTotal),
          toMB: formatMB(curr.heapTotal),
          heapUsedPercent: curr.heapUsedPercent.toFixed(1),
          freeHeapMB: formatMB(curr.freeHeap),
        });
      }
      if (rssDelta < -50 * 1024 * 1024) {
        criticalEvents.push({
          label: curr.label,
          type: "MAJOR_GC",
          rssDropMB: formatMB(Math.abs(rssDelta)),
        });
      }
      if (curr.heapUsedPercent > 85) {
        criticalEvents.push({
          label: curr.label,
          type: "HIGH_USAGE",
          heapUsedPercent: curr.heapUsedPercent.toFixed(1),
          freeHeapMB: formatMB(curr.freeHeap),
        });
      }
    }
    process.stderr.write("\nKEY MILESTONES:\n");
    const milestones = [
      this.statsHistory[0],
      this.statsHistory.find((s) => s.label.includes("Objective 0")),
      this.statsHistory.find((s) => s.label.includes("Objective 5")),
      this.statsHistory.find((s) => s.label.includes("Objective 10")),
      this.statsHistory.find((s) => s.label.includes("Objective 15")),
      this.statsHistory.find((s) => s.label.includes("Objective 20")),
      this.statsHistory.find((s) => s.label.includes("Objective 21")),
      this.statsHistory.find((s) => s.label.includes("Objective 22")),
      this.statsHistory.find((s) => s.label.includes("Objective 23")),
      this.statsHistory.find((s) => s.label.includes("Objective 24")),
      this.statsHistory.find((s) => s.label.includes("Objective 25")),
      this.statsHistory[this.statsHistory.length - 1],
    ].filter(Boolean);
    milestones.forEach((stat) => {
      const msg =
        `  [${stat.label}]\n` +
        `    Heap: ${formatMB(stat.heapUsed)}/${formatMB(stat.heapTotal)} MB (${stat.heapUsedPercent.toFixed(1)}% used, ${formatMB(stat.freeHeap)} MB free)\n` +
        `    RSS: ${formatMB(stat.rss)} MB\n`;
      process.stderr.write(msg);
    });
    if (criticalEvents.length > 0) {
      process.stderr.write("\n⚠️ CRITICAL EVENTS:\n");
      criticalEvents.forEach((event) => {
        if (event.type === "HEAP_SHRINK") {
          const msg =
            `  ⚠️⚠️⚠️ [${event.label}] HEAP SHRUNK by ${event.heapShrinkMB} MB\n` +
            `     From ${event.fromMB} MB → ${event.toMB} MB (${event.heapUsedPercent}% used, ${event.freeHeapMB} MB free)\n`;
          process.stderr.write(msg);
        } else if (event.type === "MAJOR_GC") {
          process.stderr.write(`  ⚠️ [${event.label}] MAJOR GC EVENT: RSS dropped ${event.rssDropMB} MB\n`);
        } else if (event.type === "HIGH_USAGE") {
          process.stderr.write(
            `  ⚠️⚠️ [${event.label}] HIGH HEAP USAGE: ${event.heapUsedPercent}% (${event.freeHeapMB} MB free)\n`
          );
        }
      });
    }
    const first = this.statsHistory[0];
    const last = this.statsHistory[this.statsHistory.length - 1];
    if (first && last) {
      const rssGrowth = last.rss - first.rss;
      const heapGrowth = last.heapTotal - first.heapTotal;
      const heapUsedGrowth = last.heapUsed - first.heapUsed;
      process.stderr.write("\nTOTAL GROWTH:\n");
      process.stderr.write(`  RSS: ${formatMB(rssGrowth >= 0 ? "+" : "")}${formatMB(rssGrowth)} MB\n`);
      process.stderr.write(`  Heap Total: ${formatMB(heapGrowth >= 0 ? "+" : "")}${formatMB(heapGrowth)} MB\n`);
      process.stderr.write(`  Heap Used: ${formatMB(heapUsedGrowth >= 0 ? "+" : "")}${formatMB(heapUsedGrowth)} MB\n`);
      process.stderr.write(`  Final Heap Usage: ${last.heapUsedPercent.toFixed(1)}% (${formatMB(last.freeHeap)} MB free)\n`);
    }
    process.stderr.write("=".repeat(80) + "\n");
    process.stderr.write("\n");
  }

  installProcessErrorHooks() {
    if (typeof process === "undefined") return;
    const originalUncaught = process.listeners("uncaughtException");
    process.removeAllListeners("uncaughtException");
    process.on("uncaughtException", (error) => {
      this.debug = true;
      this.log("UNCAUGHT EXCEPTION - Final Heap State");
      this.printSummary();
      originalUncaught.forEach((listener) => listener(error));
    });
    process.on("unhandledRejection", () => {
      this.debug = true;
      this.log("UNHANDLED REJECTION - Heap State");
      this.printSummary();
    });
  }
}
