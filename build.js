import * as esbuild from 'esbuild';
import { execSync } from 'node:child_process';

const watch = process.argv.includes('--watch');

const sharedConfig = {
  bundle: true,
  platform: 'browser',
  target: 'firefox128',
  format: 'iife',
  sourcemap: watch ? 'inline' : false,
};

await esbuild.build({
  ...sharedConfig,
  entryPoints: ['src/content.js'],
  outfile: 'content.js',
});

await esbuild.build({
  ...sharedConfig,
  entryPoints: ['src/options/options.js'],
  outfile: 'options.js',
});

if (!watch) {
  execSync('npx web-ext build --overwrite-dest', { stdio: 'inherit' });
}

console.log('Build complete.');
