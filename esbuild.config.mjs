/**
 * Mobin Panel — esbuild configuration
 * Created by Mobin.A
 *
 * Bundles the TypeScript worker (src/worker.ts) and every static asset under
 * public/ into a single, self-contained dist/worker.js file. Static files are
 * inlined as raw text via the `inline-assets` plugin below, so the Worker has
 * zero dependency on Workers Assets / KV for serving the UI.
 */
import esbuild from 'esbuild';
import { readFile, mkdir, cp } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));

/**
 * inline-assets plugin
 * Resolves virtual imports of the form  ~public/<path>  (e.g. ~public/index.html)
 * to files under ./public and loads them as raw text, so they can be served
 * directly from the bundled Worker.
 */
const inlineAssets = {
  name: 'inline-assets',
  setup(build) {
    build.onResolve({ filter: /^~public\// }, (args) => ({
      path: path.join(root, 'public', args.path.slice('~public/'.length)),
    }));
    build.onLoad({ filter: /\.(html|css|js|svg|png|jpe?g|ico|woff2?|txt)$/ }, async (args) => {
      if (!args.path.startsWith(path.join(root, 'public'))) return undefined;
      const contents = await readFile(args.path, 'utf8');
      return { contents, loader: 'text', resolveDir: path.dirname(args.path) };
    });
  },
};

const env = process.env.NODE_ENV || 'development';

/** @type {import('esbuild').BuildOptions} */
const options = {
  entryPoints: [path.join(root, 'src', 'worker.ts')],
  bundle: true,
  minify: env === 'production',
  sourcemap: env === 'development' ? 'inline' : false,
  target: 'es2022',
  format: 'esm',
  platform: 'browser',
  define: {
    'process.env.NODE_ENV': JSON.stringify(env),
  },
  logLevel: 'info',
  outfile: path.join(root, 'dist', 'worker.js'),
  plugins: [inlineAssets],
};

await mkdir(path.join(root, 'dist'), { recursive: true });
await esbuild.build(options);

// Convenience: also emit a single-file deploy artifact at the repo root.
await cp(path.join(root, 'dist', 'worker.js'), path.join(root, 'worker.js'), { force: true });
console.log('✔ Mobin Panel build complete → dist/worker.js + worker.js');
