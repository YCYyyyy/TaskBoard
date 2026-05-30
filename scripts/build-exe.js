'use strict';

const { spawnSync } = require('child_process');
const { copyFileSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } = require('fs');
const path = require('path');
const { build } = require('esbuild');

const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const BUNDLE_PATH = path.join(DIST_DIR, 'taskboard.bundle.cjs');
const BLOB_PATH = path.join(DIST_DIR, 'taskboard.blob');
const SEA_CONFIG_PATH = path.join(DIST_DIR, 'sea-config.json');
const EXE_PATH = path.join(DIST_DIR, 'TaskBoard.exe');
const SEA_FUSE = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  resetDist();

  await build({
    entryPoints: [path.join(ROOT_DIR, 'server.js')],
    outfile: BUNDLE_PATH,
    bundle: true,
    format: 'cjs',
    platform: 'node',
    target: 'node24',
    logLevel: 'info'
  });

  writeFileSync(
    SEA_CONFIG_PATH,
    `${JSON.stringify({
      main: BUNDLE_PATH,
      output: BLOB_PATH,
      disableExperimentalSEAWarning: true,
      assets: collectPublicAssets(PUBLIC_DIR)
    }, null, 2)}\n`
  );

  run(process.execPath, ['--experimental-sea-config', SEA_CONFIG_PATH]);
  copyFileSync(process.execPath, EXE_PATH);
  injectSeaBlob();
  cleanIntermediates();

  console.log(`\nBuilt ${EXE_PATH}`);
}

function resetDist() {
  const resolvedDist = path.resolve(DIST_DIR);
  const resolvedRoot = path.resolve(ROOT_DIR);

  if (!resolvedDist.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`Refusing to clean outside project: ${resolvedDist}`);
  }

  rmSync(resolvedDist, { force: true, recursive: true });
  mkdirSync(resolvedDist, { recursive: true });
}

function collectPublicAssets(dir) {
  const assets = {};

  for (const filePath of walk(dir)) {
    const relativePath = path.relative(ROOT_DIR, filePath).replaceAll(path.sep, '/');
    assets[relativePath] = filePath;
  }

  return assets;
}

function walk(dir) {
  const entries = [];

  for (const entry of readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      entries.push(...walk(fullPath));
    } else {
      entries.push(fullPath);
    }
  }

  return entries;
}

function injectSeaBlob() {
  const postjectCli = path.join(ROOT_DIR, 'node_modules', 'postject', 'dist', 'cli.js');
  const args = [
    postjectCli,
    EXE_PATH,
    'NODE_SEA_BLOB',
    BLOB_PATH,
    '--sentinel-fuse',
    SEA_FUSE
  ];

  run(process.execPath, args);
}

function cleanIntermediates() {
  for (const filePath of [BUNDLE_PATH, BLOB_PATH, SEA_CONFIG_PATH]) {
    rmSync(filePath, { force: true });
  }
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: ROOT_DIR,
    stdio: 'inherit'
  });

  if (result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(' ')}`);
  }
}
