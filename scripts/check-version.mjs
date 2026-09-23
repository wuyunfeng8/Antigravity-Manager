#!/usr/bin/env node

import { readFileSync } from 'node:fs';

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
const expected = process.argv[2] || packageJson.version;
const packageLock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
const tauriConfig = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8'));
const cargoToml = readFileSync('src-tauri/Cargo.toml', 'utf8');
const cargoLock = readFileSync('src-tauri/Cargo.lock', 'utf8');
const settings = readFileSync('src/pages/Settings.tsx', 'utf8');

const actual = {
  'package.json': packageJson.version,
  'package-lock.json': packageLock.version,
  'package-lock.json root package': packageLock.packages?.['']?.version,
  'tauri.conf.json': tauriConfig.version,
  'Cargo.toml': cargoToml.match(/^version = "([^"]+)"/m)?.[1],
  'Cargo.lock antigravity-tools': cargoLock.match(/\[\[package\]\]\s+name = "antigravity-tools"\s+version = "([^"]+)"/)?.[1],
  'Settings.tsx fallback': settings.match(/useState<string>\('([\d.]+)'\)/)?.[1],
};

const mismatches = Object.entries(actual).filter(([, version]) => version !== expected);
if (mismatches.length) {
  for (const [file, version] of mismatches) {
    process.stderr.write(`${file}: ${version || 'missing'} (expected ${expected})\n`);
  }
  process.exit(1);
}
process.stdout.write(`Version fields agree on ${expected}.\n`);
