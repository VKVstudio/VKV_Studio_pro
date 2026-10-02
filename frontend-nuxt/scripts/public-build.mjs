import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const cwd = fileURLToPath(new URL('../', import.meta.url));
const env = { ...process.env, PUBLICATION_MODE: 'public', VKV_PUBLIC_RELEASE_BUILD: '1' };
const gate = spawnSync(process.execPath, ['--experimental-strip-types', 'scripts/content-gate.mjs'], { cwd, stdio: 'inherit', env });
if (gate.status !== 0) process.exit(gate.status ?? 1);
// Use the installed runtime directly; building must not trigger package reinstalls.
for (const args of [
  ['node_modules/nuxt/bin/nuxt.mjs', 'generate'],
  ['scripts/security-headers.mjs'],
  ['--experimental-strip-types', 'scripts/indexing-artifacts.mjs'],
]) {
  const step = spawnSync(process.execPath, args, { cwd, stdio: 'inherit', env });
  if (step.status !== 0) process.exit(step.status ?? 1);
}
