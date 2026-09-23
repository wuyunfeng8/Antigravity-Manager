import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = mkdtempSync(join(tmpdir(), 'amt-release-test-'));
const input = join(root, 'artifacts');
const output = join(root, 'release');
const version = '9.8.7';
const names = [
  `AMT_${version}_aarch64.dmg`, `AMT_${version}_x64.dmg`,
  'AMT_aarch64.app.tar.gz', 'AMT_aarch64.app.tar.gz.sig',
  'AMT_x64.app.tar.gz', 'AMT_x64.app.tar.gz.sig',
  'AMT_universal.app.tar.gz', 'AMT_universal.app.tar.gz.sig',
  `AMT_${version}_x64-setup.exe`, `AMT_${version}_x64-setup.exe.sig`,
  `AMT_${version}_amd64.AppImage`, `AMT_${version}_amd64.AppImage.sig`,
  `AMT_${version}_aarch64.AppImage`, `AMT_${version}_aarch64.AppImage.sig`,
  `AMT_${version}_amd64.deb`, `AMT_${version}_arm64.deb`,
  `AMT-${version}-1.x86_64.rpm`, `AMT-${version}-1.aarch64.rpm`,
];

try {
  mkdirSync(input);
  for (const name of names) writeFileSync(join(input, name), name + '-test-content-long-enough');
  const run = () => spawnSync(process.execPath, ['scripts/prepare-release.mjs', input, output, version, 'example/amt'], { encoding: 'utf8' });
  assert.equal(run().status, 0);
  const updater = JSON.parse(readFileSync(join(output, 'updater.json'), 'utf8'));
  assert.equal(Object.keys(updater.platforms).length, 5);
  assert.equal(readdirSync(output).length, names.length + 2);
  assert.equal(readFileSync(join(output, 'SHA256SUMS'), 'utf8').trim().split('\n').length, names.length + 1);
  const testCask = join(root, 'antigravity-tools.rb');
  copyFileSync('Casks/antigravity-tools.rb', testCask);
  const caskUpdate = spawnSync(process.execPath, ['scripts/update-cask-digests.mjs', version, join(output, 'SHA256SUMS'), testCask], { encoding: 'utf8' });
  assert.equal(caskUpdate.status, 0);
  assert.match(readFileSync(testCask, 'utf8'), /version "9\.8\.7"/);

  rmSync(output, { recursive: true });
  rmSync(join(input, `AMT_${version}_x64-setup.exe`));
  const incomplete = run();
  assert.notEqual(incomplete.status, 0);
  assert.match(incomplete.stderr, /Missing or empty release asset/);

  writeFileSync(join(input, `AMT_${version}_x64-setup.exe`), 'restored-installer');
  writeFileSync(join(input, `AMT_${version}_x64-setup.exe.sig`), 'invalid');
  const invalidSignature = run();
  assert.notEqual(invalidSignature.status, 0);
  assert.match(invalidSignature.stderr, /Invalid updater signature/);
  process.stdout.write('Release artifact gate passed.\n');
} finally {
  rmSync(root, { recursive: true, force: true });
}
