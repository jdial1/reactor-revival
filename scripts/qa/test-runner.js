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
  console.log('--- Starting full test suite (lint, architecture checks, vitest) ---');

  const lintCode = runCommand('npm', ['run', 'lint']);
  const importsCode = runCommand('npm', ['run', 'check:imports']);
  const harnessCode = runCommand('npm', ['run', 'check:harness-exile']);
  const methodlessCode = runCommand('npm', ['run', 'check:methodless-projection']);
  const tickBudgetCode = runCommand('npm', ['run', 'check:tick-project-budget']);
  const knipBaselineCode = runCommand('npm', ['run', 'check:knip-baseline']);
  const eslintBudgetCode = runCommand('npm', ['run', 'check:eslint-warning-budget']);
  const simNoDomCode = runCommand('npm', ['run', 'check:sim-no-dom']);
  const [lintExit, importsExit, harnessExit, methodlessExit, tickBudgetExit, knipBaselineExit, eslintBudgetExit, simNoDomExit] = await Promise.all([
    lintCode, importsCode, harnessCode, methodlessCode, tickBudgetCode, knipBaselineCode, eslintBudgetCode, simNoDomCode,
  ]);
  if (lintExit !== 0) process.exit(lintExit);
  if (importsExit !== 0) process.exit(importsExit);
  if (harnessExit !== 0) process.exit(harnessExit);
  if (methodlessExit !== 0) process.exit(methodlessExit);
  if (tickBudgetExit !== 0) process.exit(tickBudgetExit);
  if (knipBaselineExit !== 0) process.exit(knipBaselineExit);
  if (eslintBudgetExit !== 0) process.exit(eslintBudgetExit);
  if (simNoDomExit !== 0) process.exit(simNoDomExit);

  const swExit = await runCommand('npm', ['run', 'build:sw']);
  if (swExit !== 0) process.exit(swExit);

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

  console.log('\n--- All tests, lint, and architecture checks passed! ---');
}

runTests().catch(err => {
  console.error('\n! Unexpected error in test runner:', err);
  process.exit(1);
});
