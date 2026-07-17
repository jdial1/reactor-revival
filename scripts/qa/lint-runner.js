import { spawn } from 'child_process';
import process from 'process';

function runCommand(command, args = []) {
  return new Promise((resolve) => {
    console.log(`\n> Running: ${command} ${args.join(' ')}`);
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: true
    });
    child.on('close', (code) => {
      if (code !== 0) {
        console.error(`\n! Command failed: ${command} ${args.join(' ')} (exit code: ${code})`);
        resolve(false);
      } else {
        resolve(true);
      }
    });
    child.on('error', () => resolve(false));
  });
}

async function runLint() {
  console.log('--- Starting linting (JS and CSS) ---');

  const [jsSuccess, cssSuccess] = await Promise.all([
    runCommand('npm', ['run', 'lint:js']),
    runCommand('npm', ['run', 'lint:css'])
  ]);

  if (!jsSuccess || !cssSuccess) {
    process.exit(1);
  }

  console.log('\n--- All linting passed! ---');
}

runLint().catch(err => {
  console.error('\n! Unexpected error in lint runner:', err);
  process.exit(1);
});
