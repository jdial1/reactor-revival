/**
 * Centralized logging utility for Reactor Revival
 * Provides consistent logging levels and easy control over verbosity
 */

class Logger {
    constructor() {
        this.levels = {
            ERROR: 0,
            WARN: 1,
            INFO: 2,
            DEBUG: 3
        };

        this.productionMode = typeof window !== 'undefined' && window.PRODUCTION_BUILD === true;

        // Default to INFO level in production, DEBUG in development
        this.currentLevel = this.levels.INFO;

        // Check if we're in development mode
        if (typeof process !== 'undefined' && process.env.NODE_ENV === 'development') {
            this.currentLevel = this.levels.DEBUG;
        }

        // Check for localStorage override (but not in production)
        if (!this.productionMode) {
            try {
                const storedLevel = localStorage.getItem('reactor_log_level');
                if (storedLevel && this.levels[storedLevel.toUpperCase()] !== undefined) {
                    this.currentLevel = this.levels[storedLevel.toUpperCase()];
                }
            } catch (e) {
                // Ignore localStorage errors
            }
        }
    }

    setLevel(level) {
        if (this.levels[level.toUpperCase()] !== undefined) {
            this.currentLevel = this.levels[level.toUpperCase()];
            try {
                localStorage.setItem('reactor_log_level', level.toUpperCase());
            } catch (e) {
                // Ignore localStorage errors
            }
        }
    }

    shouldLog(level) {
        if (this.productionMode) {
            return level <= this.levels.WARN;
        }
        return this.currentLevel >= level;
    }

    _formatArgs(args) {
        const seen = new WeakSet();
        const replacer = (key, value) => {
            if (typeof value === 'object' && value !== null) {
                if (seen.has(value)) {
                    return '[Circular]';
                }
                seen.add(value);
                if (value.constructor && value.constructor.name !== 'Object' && value.constructor.name !== 'Array') {
                    return `[${value.constructor.name}]`;
                }
            }
            return value;
        };

        return args.map(arg => {
            if (typeof arg === 'object' && arg !== null) {
                try {
                    return JSON.stringify(arg, replacer, 2);
                } catch (e) {
                    return '[Unserializable Object]';
                }
            }
            return arg;
        });
    }

    _log(levelName, level, message, ...args) {
        if (this.shouldLog(level)) {
            const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
            const prefix = `[${timestamp}] [${levelName}]`;
            const formattedArgs = this._formatArgs(args);
            console[levelName.toLowerCase()](prefix, message, ...formattedArgs);
        }
    }

    error(message, ...args) {
        this._log('ERROR', this.levels.ERROR, message, ...args);
    }

    warn(message, ...args) {
        this._log('WARN', this.levels.WARN, message, ...args);
    }

    info(message, ...args) {
        this._log('INFO', this.levels.INFO, message, ...args);
    }

    debug(message, ...args) {
        this._log('DEBUG', this.levels.DEBUG, message, ...args);
    }

    group(label) {
        if (this.shouldLog(this.levels.DEBUG)) {
            console.group(label);
        }
    }

    groupCollapsed(label) {
        if (this.shouldLog(this.levels.DEBUG)) {
            console.groupCollapsed(label);
        }
    }

    groupEnd() {
        if (this.shouldLog(this.levels.DEBUG)) {
            console.groupEnd();
        }
    }

    // Convenience methods for specific contexts
    game(message, ...args) {
        this.info(`[GAME] ${message}`, ...args);
    }

    ui(message, ...args) {
        this.info(`[UI] ${message}`, ...args);
    }

    engine(message, ...args) {
        this.debug(`[ENGINE] ${message}`, ...args);
    }

    state(message, ...args) {
        this.debug(`[STATE] ${message}`, ...args);
    }

    router(message, ...args) {
        this.debug(`[ROUTER] ${message}`, ...args);
    }
}

// Create singleton instance
const logger = new Logger();

// Export both the class and instance
export { Logger, logger };
export default logger;
