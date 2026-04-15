import { glob } from 'glob';
import { spawnSync } from 'child_process';

async function checkSyntax() {
  const files = await glob('**/*.{js,cjs,mjs}', {
    ignore: ['node_modules/**', 'public/lib/**']
  });

  console.log(`Checking syntax for ${files.length} files...`);

  let hasError = false;
  for (const file of files) {
    const result = spawnSync('node', ['--check', file], { stdio: 'inherit' });
    if (result.status !== 0) {
      console.error(`Syntax check failed for: ${file}`);
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
