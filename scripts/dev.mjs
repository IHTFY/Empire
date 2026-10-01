import { context } from 'esbuild';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildOptions } from './build.mjs';

// Build before Hosting starts, then rebuild modules and styles as they are edited.
const builder = await context(buildOptions);
await builder.rebuild();
await builder.watch();
const firebaseCLI = fileURLToPath(new URL('../node_modules/firebase-tools/lib/bin/firebase.js', import.meta.url));
const emulators = spawn(process.execPath, [firebaseCLI, 'emulators:start',
  '--project', 'demo-empire-local', '--only', 'hosting,auth,database,functions'], {
  cwd: buildOptions.absWorkingDir,
  stdio: 'inherit'
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => emulators.kill(signal));
}
emulators.on('error', async error => {
  console.error(error);
  await builder.dispose();
  process.exitCode = 1;
});
emulators.on('exit', async (code, signal) => {
  await builder.dispose();
  process.exitCode = code ?? (signal ? 1 : 0);
});
