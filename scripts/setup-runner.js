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
    process.exit(result.status || 1);
  }
}

async function runSetup() {
  console.log('--- Starting setup ---');

  runCommand('npm', ['run', 'generate-metadata']);
  runCommand('npm', ['run', 'copy-libs']);
  runCommand('npm', ['run', 'build:sw']);

  console.log('\n--- Setup completed successfully! ---');
}

runSetup().catch(err => {
  console.error('\n! Unexpected error in setup runner:', err);
  process.exit(1);
});
