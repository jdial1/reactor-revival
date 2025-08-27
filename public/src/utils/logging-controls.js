/**
 * Logging Controls for Reactor Revival
 * Run these commands in the browser console to control logging levels
 */

// Import the logger (this will be available after the app loads)
let logger = null;

// Wait for the logger to be available
function waitForLogger() {
    if (window.game && window.game.logger) {
        logger = window.game.logger;
        return true;
    }
    return false;
}

// Set logging level
function setLogLevel(level) {
    if (!waitForLogger()) {
        console.warn('Logger not available yet. Wait for the game to load.');
        return;
    }

    const validLevels = ['ERROR', 'WARN', 'INFO', 'DEBUG'];
    if (!validLevels.includes(level.toUpperCase())) {
        console.warn(`Invalid level. Use one of: ${validLevels.join(', ')}`);
        return;
    }

    logger.setLevel(level);
    console.log(`Logging level set to: ${level.toUpperCase()}`);
}

// Quick access functions
function setDebug() { setLogLevel('DEBUG'); }
function setInfo() { setLogLevel('INFO'); }
function setWarn() { setLogLevel('WARN'); }
function setError() { setLogLevel('ERROR'); }

// Show current logging level
function getLogLevel() {
    if (!waitForLogger()) {
        console.warn('Logger not available yet. Wait for the game to load.');
        return;
    }

    const levels = ['ERROR', 'WARN', 'INFO', 'DEBUG'];
    const currentLevel = levels[logger.currentLevel];
    console.log(`Current logging level: ${currentLevel}`);
    return currentLevel;
}

// Show available commands
function showLoggingHelp() {
    console.log(`
Logging Controls Available:
  setDebug()     - Enable all logging (most verbose)
  setInfo()      - Enable INFO, WARN, and ERROR logging
  setWarn()      - Enable only WARN and ERROR logging
  setError()     - Enable only ERROR logging (least verbose)
  getLogLevel()  - Show current logging level
  showLoggingHelp() - Show this help message

Examples:
  setDebug()     // Enable debug logging
  setInfo()      // Set to info level
  setWarn()      // Set to warning level only
  `);
}

// Make functions available globally
window.setLogLevel = setLogLevel;
window.setDebug = setDebug;
window.setInfo = setInfo;
window.setWarn = setWarn;
window.setError = setError;
window.getLogLevel = getLogLevel;
window.showLoggingHelp = showLoggingHelp;

// Auto-show help when loaded
console.log('Logging controls loaded! Run showLoggingHelp() for available commands.');
