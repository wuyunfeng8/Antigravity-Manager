#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';

const [version, checksumPath, caskPath = 'Casks/antigravity-tools.rb'] = process.argv.slice(2);
if (!/^\d+\.\d+\.\d+$/.test(version || '') || !checksumPath) {
  throw new Error('Usage: update-cask-digests.mjs <version> <SHA256SUMS> [cask-path]');
}
const entries = new Map(readFileSync(checksumPath, 'utf8').trim().split('\n').map((line) => {
  const match = line.match(/^([0-9a-f]{64})  (\S+)$/);
  if (!match) throw new Error('Invalid SHA256SUMS entry');
  return [match[2], match[1]];
}));
const arm = entries.get(`AMT_${version}_aarch64.dmg`);
const intel = entries.get(`AMT_${version}_x64.dmg`);
if (!arm || !intel) throw new Error('Both macOS DMG checksums are required');

const current = readFileSync(caskPath, 'utf8');
const updated = current
  .replace(/^  version "[^"]+"/m, `  version "${version}"`)
  .replace(/^    sha256 arm: "[0-9a-f]{64}",\n           intel: "[0-9a-f]{64}"/m,
    `    sha256 arm: "${arm}",\n           intel: "${intel}"`);
if (updated === current || !updated.includes(`version "${version}"`) || !updated.includes(`sha256 arm: "${arm}"`)) {
  throw new Error('Cask version or checksum pattern was not updated');
}
writeFileSync(caskPath, updated);
process.stdout.write(`Updated macOS Cask for ${version} from verified release checksums.\n`);
