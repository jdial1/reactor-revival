import { spawnSync } from 'child_process';
import process from 'process';

function runCommand(command, args = [], env = process.env) {
  console.log(`\n> Running: ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, { 
    stdio: 'inherit', 
    shell: true,
    env: { ...env }
  });
  
  if (result.status !== 0) {
    console.error(`\n! Command failed: ${command} ${args.join(' ')} (exit code: ${result.status})`);
    process.exit(result.status || 1);
  }
}

async function runTests() {
  console.log('--- Starting full test suite (lint, syntax check, vitest) ---');

  runCommand('npm', ['run', 'lint']);

  runCommand('node', ['scripts/check-syntax.js']);

  const vitestArgs = [
    'vitest',
    'run',
    '-c', 'config/vitest.config.mjs'
  ];

  const vitestEnv = {
    ...process.env,
    NODE_OPTIONS: "--max-old-space-size=8192 --expose-gc"
  };

  runCommand('npx', vitestArgs, vitestEnv);

  console.log('\n--- All tests, lint, and syntax checks passed! ---');
}

runTests().catch(err => {
  console.error('\n! Unexpected error in test runner:', err);
  process.exit(1);
});
