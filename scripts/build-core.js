/**
 * build-core.js - Bundle src/core/ into a CommonJS module for the main process
 */
const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs-extra');

const outDir = path.join(__dirname, '..', 'dist', 'core');

async function build() {
  await fs.ensureDir(outDir);

  await esbuild.build({
    entryPoints: [
      path.join(__dirname, '..', 'src', 'core', 'llm', 'client.js'),
      path.join(__dirname, '..', 'src', 'core', 'wiki', 'index.js'),
      path.join(__dirname, '..', 'src', 'core', 'ingest', 'index.js'),
      path.join(__dirname, '..', 'src', 'core', 'query', 'index.js'),
      path.join(__dirname, '..', 'src', 'core', 'lint', 'index.js'),
    ],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outdir: outDir,
    outExtension: { '.js': '.cjs' },
    external: ['electron'],
    sourcemap: false,
    minify: false,
    logLevel: 'info',
  });

  console.log('[build-core] ✓ Core modules bundled to dist/core/');
}

build().catch(e => { console.error(e); process.exit(1); });
