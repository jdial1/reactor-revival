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

        // Default to INFO level in production, DEBUG in development
        this.currentLevel = this.levels.INFO;

        // Check if we're in development mode
        if (typeof process !== 'undefined' && process.env.NODE_ENV === 'development') {
            this.currentLevel = this.levels.DEBUG;
        }

        // Check for localStorage override
        try {
            const storedLevel = localStorage.getItem('reactor_log_level');
            if (storedLevel && this.levels[storedLevel.toUpperCase()] !== undefined) {
                this.currentLevel = this.levels[storedLevel.toUpperCase()];
            }
        } catch (e) {
            // Ignore localStorage errors
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
        return this.currentLevel >= level;
    }

    formatMessage(level, message, ...args) {
        const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
        const prefix = `[${timestamp}] [${level}]`;

        if (args.length === 0) {
            return `${prefix} ${message}`;
        }

        return `${prefix} ${message}`;
    }

    error(message, ...args) {
        if (this.shouldLog(this.levels.ERROR)) {
            console.error(this.formatMessage('ERROR', message), ...args);
        }
    }

    warn(message, ...args) {
        if (this.shouldLog(this.levels.WARN)) {
            console.warn(this.formatMessage('WARN', message), ...args);
        }
    }

    info(message, ...args) {
        if (this.shouldLog(this.levels.INFO)) {
            console.log(this.formatMessage('INFO', message), ...args);
        }
    }

    debug(message, ...args) {
        if (this.shouldLog(this.levels.DEBUG)) {
            console.log(this.formatMessage('DEBUG', message), ...args);
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
