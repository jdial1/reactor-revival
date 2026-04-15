import { spawnSync } from 'child_process';
import process from 'process';

function runCommand(command, args = []) {
  console.log(`\n> Running: ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, { 
    stdio: 'inherit', 
    shell: true
  });
  
  if (result.status !== 0) {
    console.error(`\n! Command failed: ${command} ${args.join(' ')} (exit code: ${result.status})`);
    return false;
  }
  return true;
}

async function runLint() {
  console.log('--- Starting linting (JS and CSS) ---');

  const jsSuccess = runCommand('npm', ['run', 'lint:js']);
  const cssSuccess = runCommand('npm', ['run', 'lint:css']);

  if (!jsSuccess || !cssSuccess) {
    process.exit(1);
  }

  console.log('\n--- All linting passed! ---');
}

runLint().catch(err => {
  console.error('\n! Unexpected error in lint runner:', err);
  process.exit(1);
});
