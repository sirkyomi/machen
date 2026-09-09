const {spawnSync} = require('node:child_process');
// Run sequentially: Electron tests interact with desktop focus and shortcuts.
for (const test of ['e2e', 'machen', 'contexts-archive', 'language', 'appearance', 'controls', 'update-ui', 'planning']) {
  const result = spawnSync(process.execPath, [`tests/${test}.cjs`], {stdio: 'inherit'});
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
