import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

// Keep source modules readable and serve one JS file and one CSS file. Source maps
// support debugging the original modules; no minification or code splitting is needed.
export const buildOptions = {
  absWorkingDir: fileURLToPath(new URL('../', import.meta.url)),
  entryPoints: ['public/script.js', 'public/style.css'],
  outdir: 'public/assets',
  bundle: true,
  format: 'esm',
  sourcemap: true,
  logLevel: 'info'
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await build(buildOptions);
}
