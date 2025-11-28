export class DebugHistory {
    constructor(maxSize = 200) {
        this.maxSize = maxSize;
        this.history = [];
    }

    add(source, message, data = {}) {
        if (this.history.length >= this.maxSize) {
            this.history.shift();
        }
        this.history.push({
            timestamp: performance.now(),
            source,
            message,
            data
        });
    }

    getHistory() {
        return this.history;
    }

    clear() {
        this.history = [];
    }

    format() {
        if (this.history.length === 0) {
            return "No events recorded.";
        }
        return this.history.map(entry => {
            const time = entry.timestamp.toFixed(2).padStart(8, ' ');
            const dataStr = Object.keys(entry.data).length > 0 ? ` | ${JSON.stringify(entry.data)}` : '';
            return `[${time}ms] [${entry.source.toUpperCase()}] ${entry.message}${dataStr}`;
        }).join('\n');
    }
}

