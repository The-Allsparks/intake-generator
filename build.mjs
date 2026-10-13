import { build } from 'esbuild';
import { copyFile, mkdir } from 'node:fs/promises';

await mkdir('dist', { recursive: true });
await build({
  entryPoints: ['app.js', 'mesh-worker.js'],
  bundle: true,
  format: 'esm',
  outdir: 'dist',
  minify: true,
  external: ['node:*']
});
await copyFile('node_modules/manifold-3d/manifold.wasm', 'dist/manifold.wasm');
for (const file of ['index.html', 'style.css', '_headers', 'logo.png', 'favicon.png']) {
  await copyFile(file, `dist/${file}`);
}
