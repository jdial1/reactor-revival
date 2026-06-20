import { spawn } from 'child_process';
import process from 'process';

function runCommand(command, args = [], env = process.env) {
  return new Promise((resolve, reject) => {
    console.log(`\n> Running: ${command} ${args.join(' ')}`);
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: true,
      env: { ...env }
    });
    child.on('close', (code) => {
      if (code !== 0) {
        console.error(`\n! Command failed: ${command} ${args.join(' ')} (exit code: ${code})`);
        resolve(code ?? 1);
      } else {
        resolve(0);
      }
    });
    child.on('error', reject);
  });
}

async function runTests() {
  console.log('--- Starting full test suite (lint, syntax check, vitest) ---');

  const lintCode = runCommand('npm', ['run', 'lint']);
  const syntaxCode = runCommand('node', ['scripts/check-syntax.js']);
  const [lintExit, syntaxExit] = await Promise.all([lintCode, syntaxCode]);
  if (lintExit !== 0) process.exit(lintExit);
  if (syntaxExit !== 0) process.exit(syntaxExit);

  const vitestArgs = [
    'vitest',
    'run',
    '-c', 'config/vitest.config.mjs'
  ];

  const vitestEnv = {
    ...process.env,
    NODE_OPTIONS: "--max-old-space-size=8192 --expose-gc"
  };

  const vitestExit = await runCommand('npx', vitestArgs, vitestEnv);
  if (vitestExit !== 0) process.exit(vitestExit);

  console.log('\n--- All tests, lint, and syntax checks passed! ---');
}

runTests().catch(err => {
  console.error('\n! Unexpected error in test runner:', err);
  process.exit(1);
});
