#!/usr/bin/env node

const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const chokidar = require('chokidar');

const args = process.argv.slice(2);
const watchMode = args.includes('--watch');

const rootDir = path.resolve(__dirname, '..');
const extensionDir = path.join(rootDir, 'extension');
const srcDir = path.join(extensionDir, 'src');
const outDir = path.join(extensionDir, 'dist');

async function ensureOutDir() {
  await fsp.mkdir(outDir, { recursive: true });
}

async function cleanOutDir() {
  await fsp.rm(outDir, { recursive: true, force: true });
}

async function copyFile(from, to) {
  await fsp.mkdir(path.dirname(to), { recursive: true });
  await fsp.copyFile(from, to);
}

async function copyStaticAssets() {
  const filesToCopy = ['manifest.json', 'config.json'];
  await Promise.all(
    filesToCopy.map(async (file) => {
      const from = path.join(extensionDir, file);
      const to = path.join(outDir, file);
      await copyFile(from, to);
    })
  );
}

async function buildScripts() {
  await esbuild.build({
    entryPoints: {
      background: path.join(srcDir, 'background/index.js'),
      content: path.join(srcDir, 'content/index.js'),
    },
    bundle: true,
    outdir: outDir,
    target: 'chrome114',
    format: 'esm',
    sourcemap: true,
    minify: false,
    logLevel: 'info',
  });
}

async function buildAll() {
  await ensureOutDir();
  await copyStaticAssets();
  await buildScripts();
}

async function runOnce() {
  await cleanOutDir();
  await buildAll();
}

async function runWatch() {
  await runOnce();

  const scriptContext = await esbuild.context({
    entryPoints: {
      background: path.join(srcDir, 'background/index.js'),
      content: path.join(srcDir, 'content/index.js'),
    },
    bundle: true,
    outdir: outDir,
    target: 'chrome114',
    format: 'esm',
    sourcemap: true,
    minify: false,
    logLevel: 'info',
  });

  await scriptContext.watch();

  const staticWatcher = chokidar.watch([
    path.join(extensionDir, 'manifest.json'),
    path.join(extensionDir, 'config.json'),
  ]);

  staticWatcher.on('all', async (event, filePath) => {
    if (event === 'add' || event === 'change') {
      const relative = path.relative(extensionDir, filePath);
      const dest = path.join(outDir, relative);
      try {
        await copyFile(filePath, dest);
        console.log(`[static] copied ${relative}`);
      } catch (error) {
        console.error(`[static] failed to copy ${relative}`, error);
      }
    }
  });

  console.log('Watching extension sources...');
}

(async () => {
  try {
    if (watchMode) {
      await runWatch();
    } else {
      await runOnce();
    }
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
})();
