import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

// Serve one JS file and one CSS file. `pnpm build` is the production build used by
// preview and live deployment: it is minified, and source maps support debugging the
// original modules. `pnpm dev` keeps the output readable. No code splitting is needed.
export const buildOptions = {
  absWorkingDir: fileURLToPath(new URL('../', import.meta.url)),
  entryPoints: ['public/script.js', 'public/style.css'],
  outdir: 'public/assets',
  bundle: true,
  format: 'esm',
  sourcemap: true,
  minify: true,
  logLevel: 'info'
};

export const developmentBuildOptions = { ...buildOptions, minify: false };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await build(buildOptions);
}
