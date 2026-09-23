#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

const [inputDir, outputDir, version, repository] = process.argv.slice(2);
if (!inputDir || !outputDir || !/^\d+\.\d+\.\d+$/.test(version || '') || !/^[\w.-]+\/[\w.-]+$/.test(repository || '')) {
  throw new Error('Usage: prepare-release.mjs <artifacts-dir> <empty-output-dir> <version> <owner/repo>');
}
if (!statSync(inputDir).isDirectory()) throw new Error('Artifacts input is not a directory');
if (existsSync(outputDir) && readdirSync(outputDir).length) throw new Error('Release output directory must be empty');

const expected = [
  `AMT_${version}_aarch64.dmg`,
  `AMT_${version}_x64.dmg`,
  'AMT_aarch64.app.tar.gz',
  'AMT_aarch64.app.tar.gz.sig',
  'AMT_x64.app.tar.gz',
  'AMT_x64.app.tar.gz.sig',
  'AMT_universal.app.tar.gz',
  'AMT_universal.app.tar.gz.sig',
  `AMT_${version}_x64-setup.exe`,
  `AMT_${version}_x64-setup.exe.sig`,
  `AMT_${version}_amd64.AppImage`,
  `AMT_${version}_amd64.AppImage.sig`,
  `AMT_${version}_aarch64.AppImage`,
  `AMT_${version}_aarch64.AppImage.sig`,
  `AMT_${version}_amd64.deb`,
  `AMT_${version}_arm64.deb`,
  `AMT-${version}-1.x86_64.rpm`,
  `AMT-${version}-1.aarch64.rpm`,
];

function collectFiles(directory, files = new Map()) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      collectFiles(path, files);
    } else if (entry.isFile()) {
      if (files.has(entry.name)) throw new Error(`Duplicate release filename: ${entry.name}`);
      files.set(entry.name, path);
    }
  }
  return files;
}

const files = collectFiles(inputDir);
for (const name of expected) {
  const path = files.get(name);
  if (!path || statSync(path).size === 0) throw new Error(`Missing or empty release asset: ${name}`);
}

function signature(name) {
  const value = readFileSync(files.get(name), 'utf8').trim();
  if (value.length < 20) throw new Error(`Invalid updater signature: ${name}`);
  return value;
}

const base = `https://github.com/${repository}/releases/download/v${version}`;
const updater = {
  version,
  notes: 'See the release page for details.',
  pub_date: new Date().toISOString(),
  platforms: {
    'darwin-aarch64': { url: `${base}/AMT_aarch64.app.tar.gz`, signature: signature('AMT_aarch64.app.tar.gz.sig') },
    'darwin-x86_64': { url: `${base}/AMT_x64.app.tar.gz`, signature: signature('AMT_x64.app.tar.gz.sig') },
    'windows-x86_64': { url: `${base}/AMT_${version}_x64-setup.exe`, signature: signature(`AMT_${version}_x64-setup.exe.sig`) },
    'linux-x86_64': { url: `${base}/AMT_${version}_amd64.AppImage`, signature: signature(`AMT_${version}_amd64.AppImage.sig`) },
    'linux-aarch64': { url: `${base}/AMT_${version}_aarch64.AppImage`, signature: signature(`AMT_${version}_aarch64.AppImage.sig`) },
  },
};

mkdirSync(outputDir, { recursive: true });
for (const name of expected) copyFileSync(files.get(name), join(outputDir, name));
writeFileSync(join(outputDir, 'updater.json'), JSON.stringify(updater, null, 2) + '\n');

const checksums = [...expected, 'updater.json'].sort().map((name) => {
  const digest = createHash('sha256').update(readFileSync(join(outputDir, name))).digest('hex');
  return `${digest}  ${basename(name)}`;
});
writeFileSync(join(outputDir, 'SHA256SUMS'), checksums.join('\n') + '\n');
process.stdout.write(`Validated ${expected.length} release assets and five updater signatures for v${version}.\n`);
