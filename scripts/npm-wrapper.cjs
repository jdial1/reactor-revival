const path = require('path');
const { spawnSync } = require('child_process');

const nodeDir = path.dirname(process.execPath);
const npmCli = path.join(nodeDir, 'node_modules', 'npm', 'bin', 'npm-cli.js');

const env = { ...process.env };
const appData = env.APPDATA || path.join(env.USERPROFILE || '', 'AppData', 'Roaming');
env.NPM_CONFIG_PREFIX = path.join(appData, 'npm');
env.NPM_CONFIG_CACHE = path.join(appData, 'npm-cache');

const result = spawnSync(process.execPath, [npmCli, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env,
  shell: false,
});

process.exit(result.status ?? (result.signal ? 128 + 9 : 1));
