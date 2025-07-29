#!/usr/bin/env node

/**
 * Custom test runner for Reactor Revival
 * Provides better error reporting and prevents verbose dumps
 */

import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

// Test configuration
const config = {
  // Environment variables for test execution
  env: {
    VITEST_VERBOSE: 'false',
    NODE_ENV: 'test',
    // Prevent verbose error dumps
    VITEST_MAX_CONCURRENCY: '1',
    VITEST_SILENT: 'false',
    VITEST_REPORTER: 'default',
    // Limit output size
    VITEST_OUTPUT_TRUNCATE_LENGTH: '80',
    VITEST_DIFF_LIMIT: '1000'
  },

  // Test patterns to run
  patterns: [
    'tests/**/*.test.js',
    'tests/**/*.test.mjs'
  ],

  // Test patterns to exclude
  exclude: [
    'tests/**/*.disabled.test.js',
    'tests/**/*.disabled.test.mjs'
  ]
};

// Helper to run tests with specific configuration
function runTests(options = {}) {
  const {
    pattern = config.patterns,
    exclude = config.exclude,
    verbose = false,
    watch = false,
    coverage = false,
    ui = false
  } = options;

  const env = { ...process.env, ...config.env };

  if (verbose) {
    env.VITEST_VERBOSE = 'true';
  }

  const args = [
    'vitest',
    'run',
    '--config', 'vitest.config.mjs',
    '--reporter', 'default',
    '--maxConcurrency', '1',
    '--silent', 'false',
    '--outputTruncateLength', '80',
    '--diffLimit', '1000'
  ];

  // Add patterns
  if (Array.isArray(pattern)) {
    pattern.forEach(p => args.push(p));
  } else {
    args.push(pattern);
  }

  // Add exclusions
  if (Array.isArray(exclude)) {
    exclude.forEach(e => args.push('--exclude', e));
  }

  // Add coverage if requested
  if (coverage) {
    args.push('--coverage');
  }

  // Add UI mode if requested
  if (ui) {
    args[1] = 'ui';
  }

  // Add watch mode if requested
  if (watch) {
    args[1] = 'watch';
  }

  try {
    console.log('🧪 Running tests with controlled output...');
    console.log(`📁 Project root: ${projectRoot}`);
    console.log(`🔧 Environment: ${env.NODE_ENV}`);
    console.log(`📊 Verbose mode: ${env.VITEST_VERBOSE}`);

    execSync(args.join(' '), {
      cwd: projectRoot,
      env,
      stdio: 'inherit',
      encoding: 'utf8'
    });

    console.log('✅ All tests completed successfully!');
  } catch (error) {
    console.error('❌ Tests failed with errors:');

    // Provide focused error information
    if (error.stdout) {
      console.error('STDOUT:', error.stdout);
    }
    if (error.stderr) {
      console.error('STDERR:', error.stderr);
    }

    process.exit(1);
  }
}

// CLI argument parsing
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    verbose: false,
    watch: false,
    coverage: false,
    ui: false,
    pattern: config.patterns
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '--verbose':
      case '-v':
        options.verbose = true;
        break;
      case '--watch':
      case '-w':
        options.watch = true;
        break;
      case '--coverage':
      case '-c':
        options.coverage = true;
        break;
      case '--ui':
      case '-u':
        options.ui = true;
        break;
      case '--help':
      case '-h':
        showHelp();
        process.exit(0);
        break;
      default:
        if (arg.startsWith('--pattern=')) {
          options.pattern = arg.split('=')[1];
        } else if (!arg.startsWith('-')) {
          options.pattern = arg;
        }
        break;
    }
  }

  return options;
}

function showHelp() {
  console.log(`
🧪 Reactor Revival Test Runner

Usage: node scripts/test-runner.js [options] [pattern]

Options:
  -v, --verbose     Enable verbose output (shows all console logs)
  -w, --watch       Run tests in watch mode
  -c, --coverage    Generate coverage report
  -u, --ui          Run tests in UI mode
  -h, --help        Show this help message

Patterns:
  Default: tests/**/*.test.js
  Examples:
    tests/core/*.test.js     Run only core tests
    tests/ui/*.test.js       Run only UI tests
    **/complex-layouts.test.js  Run specific test file

Environment:
  VITEST_VERBOSE=false       Suppress verbose console output
  VITEST_MAX_CONCURRENCY=1   Run tests sequentially
  VITEST_OUTPUT_TRUNCATE_LENGTH=80  Limit output size

Examples:
  node scripts/test-runner.js                    # Run all tests
  node scripts/test-runner.js --verbose          # Run with verbose output
  node scripts/test-runner.js tests/core/        # Run only core tests
  node scripts/test-runner.js --coverage         # Run with coverage
  node scripts/test-runner.js --watch            # Run in watch mode
`);
}

// Main execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const options = parseArgs();
  runTests(options);
}

export { runTests, config }; 