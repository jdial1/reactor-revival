import { glob } from 'glob';
import { spawnSync } from 'child_process';
import os from 'node:os';

function* argBatches(files) {
  const budget = os.platform() === 'win32' ? 7000 : 200_000;
  let batch = [];
  let used = 0;
  const overhead = 32;
  for (const file of files) {
    const add = file.length + 1;
    if (batch.length > 0 && used + add + overhead > budget) {
      yield batch;
      batch = [];
      used = 0;
    }
    batch.push(file);
    used += add;
  }
  if (batch.length > 0) yield batch;
}

async function checkSyntax() {
  const files = await glob('**/*.{js,cjs,mjs}', {
    ignore: ['node_modules/**', 'public/lib/**']
  });

  console.log(`Checking syntax for ${files.length} files...`);

  let hasError = false;
  for (const batch of argBatches(files)) {
    const result = spawnSync('node', ['--check', ...batch], { stdio: 'inherit' });
    if (result.status !== 0) {
      hasError = true;
    }
  }

  if (hasError) {
    process.exit(1);
  } else {
    console.log('Syntax check passed for all files.');
  }
}

checkSyntax().catch(err => {
  console.error(err);
  process.exit(1);
});
