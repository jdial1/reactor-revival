/**
 * Centralized logging utility for Reactor Revival
 * Provides consistent logging levels and easy control over verbosity
 */

const VALID_LEVELS = ['error', 'warn', 'info', 'debug'];

class Logger {
    constructor() {
        this.levels = {
            ERROR: 0,
            WARN: 1,
            INFO: 2,
            DEBUG: 3
        };

        this.mutedContexts = new Set();
        this.productionMode = typeof window !== 'undefined' && window.PRODUCTION_BUILD === true;

        this.currentLevel = this.levels.INFO;

        if (typeof process !== 'undefined' && process.env.NODE_ENV === 'development') {
            this.currentLevel = this.levels.DEBUG;
        }

        if (!this.productionMode) {
            try {
                const storedLevel = localStorage.getItem('reactor_log_level');
                if (storedLevel && this.levels[storedLevel.toUpperCase()] !== undefined) {
                    this.currentLevel = this.levels[storedLevel.toUpperCase()];
                }
            } catch (e) {}
        }
    }

    setLevel(level) {
        if (this.levels[level.toUpperCase()] !== undefined) {
            this.currentLevel = this.levels[level.toUpperCase()];
            try {
                localStorage.setItem('reactor_log_level', level.toUpperCase());
            } catch (e) {}
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

    log(level, context, message, ...args) {
        const lvl = typeof level === 'string' ? level.toLowerCase() : level;
        const ctx = typeof context === 'string' ? context.toLowerCase() : 'app';
        if (!VALID_LEVELS.includes(lvl) || !ctx) return;
        if (this.mutedContexts.has(ctx)) return;
        const levelName = lvl.toUpperCase();
        const levelVal = this.levels[levelName];
        if (levelVal === undefined) return;
        const contextPrefix = ctx !== 'app' ? `[${ctx.toUpperCase()}] ` : '';
        this._log(levelName, levelVal, contextPrefix + message, ...args);
    }

    setMutedContexts(contexts) {
        this.mutedContexts = new Set(contexts.map((c) => String(c).toLowerCase()));
    }

    muteContext(context) {
        this.mutedContexts.add(String(context).toLowerCase());
    }

    unmuteContext(context) {
        this.mutedContexts.delete(String(context).toLowerCase());
    }

    error(message, ...args) {
        this.log('error', 'app', message, ...args);
    }

    warn(message, ...args) {
        this.log('warn', 'app', message, ...args);
    }

    info(message, ...args) {
        this.log('info', 'app', message, ...args);
    }

    debug(message, ...args) {
        this.log('debug', 'app', message, ...args);
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

}

const logger = new Logger();

if (typeof window !== 'undefined') {
    window.logger = logger;

    window.setLogLevel = (level) => {
        const validLevels = ['ERROR', 'WARN', 'INFO', 'DEBUG'];
        if (!validLevels.includes(level.toUpperCase())) {
            console.warn(`Invalid level. Use: ${validLevels.join(', ')}`);
            return;
        }
        logger.setLevel(level);
        console.log(`Log level set to: ${level}`);
    };

    window.setDebug = () => window.setLogLevel('DEBUG');
    window.setInfo = () => window.setLogLevel('INFO');
    window.setWarn = () => window.setLogLevel('WARN');
    window.setError = () => window.setLogLevel('ERROR');

    window.getLogLevel = () => {
        const levels = ['ERROR', 'WARN', 'INFO', 'DEBUG'];
        return levels[logger.currentLevel];
    };
}

export { Logger, logger };
export default logger;
