import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
function versionFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (entry.name === 'assets' || entry.name === 'version.json') return [];
    const path = join(directory, entry.name);
    return entry.isDirectory() ? versionFiles(path) : [path];
  }).sort();
}

// The running bundle and deployed manifest share one fingerprint, including HTML and styles.
const versionPlugin = {
  name: 'app-version',
  setup(builder) {
    let version;
    builder.onResolve({ filter: /^empire:version$/ }, () => ({ path: 'version', namespace: 'empire' }));
    builder.onLoad({ filter: /.*/, namespace: 'empire' }, () => {
      const files = [...versionFiles(join(root, 'public')), join(root, 'pnpm-lock.yaml'), join(root, 'scripts/build.mjs')];
      const hash = createHash('sha256');
      for (const path of files) hash.update(path.slice(root.length)).update('\0').update(readFileSync(path)).update('\0');
      version = hash.digest('hex');
      return { contents: `export default ${JSON.stringify(version)};`, loader: 'js', watchFiles: files };
    });
    builder.onEnd(result => {
      if (!result.errors.length) writeFileSync(join(root, 'public/version.json'), JSON.stringify({ version }) + '\n');
    });
  }
};

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
  logLevel: 'info',
  plugins: [versionPlugin]
};

export const developmentBuildOptions = { ...buildOptions, minify: false };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await build(buildOptions);
}
