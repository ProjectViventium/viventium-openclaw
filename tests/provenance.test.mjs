import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createSign, generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { validateManifest, verifyRegistrySignature } from '../scripts/verify-provenance.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(resolve(root, 'PROVENANCE.json'), 'utf8'));

test('importing the verifier has no online or command-line side effects', () => {
  const verifierUrl = pathToFileURL(resolve(root, 'scripts/verify-provenance.mjs')).href;
  const result = spawnSync(
    process.execPath,
    ['--input-type=module', '--eval', `await import('${verifierUrl}')`],
    { cwd: root, encoding: 'utf8' },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(result.stdout, '');
});

test('offline verification succeeds without embedded source ancestry', () => {
  const result = spawnSync(process.execPath, ['scripts/verify-provenance.mjs', '--offline'], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /^PASS openclaw provenance /);
});

test('the compact contract records allowlisted remote source metadata only', () => {
  const source = manifest.runtime.source;

  assert.equal(manifest.repositoryRole, 'runtime-provenance');
  assert.equal(manifest.currentTree.runtimeSource, false);
  assert.equal(Object.hasOwn(source, 'snapshotCommit'), false);
  assert.equal(
    source.commitApi,
    `https://api.github.com/repos/openclaw/openclaw/git/commits/${source.commit}`,
  );
  assert.equal(
    source.treeApi,
    `https://api.github.com/repos/openclaw/openclaw/git/trees/${source.tree}`,
  );
});

test('manifest validation rejects remapped registry and source metadata endpoints', () => {
  const changedRegistryApi = structuredClone(manifest);
  changedRegistryApi.runtime.registryMetadata =
    `https://example.test/openclaw/${changedRegistryApi.runtime.version}`;
  assert.throws(() => validateManifest(changedRegistryApi), /registry metadata endpoint/);

  const changedTarball = structuredClone(manifest);
  changedTarball.runtime.tarball =
    `https://example.test/openclaw-${changedTarball.runtime.version}.tgz`;
  assert.throws(() => validateManifest(changedTarball), /registry tarball endpoint/);

  const changedCommitApi = structuredClone(manifest);
  changedCommitApi.runtime.source.commitApi =
    `https://example.test/repos/openclaw/openclaw/git/commits/${changedCommitApi.runtime.source.commit}`;
  assert.throws(() => validateManifest(changedCommitApi), /source commit API/);

  const changedTreeApi = structuredClone(manifest);
  changedTreeApi.runtime.source.treeApi =
    `https://example.test/repos/openclaw/openclaw/git/trees/${changedTreeApi.runtime.source.tree}`;
  assert.throws(() => validateManifest(changedTreeApi), /source tree API/);
});

test('the recorded npm registry signature verifies with the recorded official key', () => {
  assert.equal(verifyRegistrySignature(manifest.runtime), true);
  assert.doesNotThrow(() => validateManifest(structuredClone(manifest)));
});

test('offline verification rejects a changed registry signature', () => {
  const changed = structuredClone(manifest);
  const signatureBytes = Buffer.from(changed.runtime.registrySignature.sig, 'base64');
  signatureBytes[signatureBytes.length - 1] ^= 1;
  changed.runtime.registrySignature.sig = signatureBytes.toString('base64');
  assert.throws(() => validateManifest(changed), /registry signature verification failed/);
});

test('offline verification rejects changed signed integrity', () => {
  const changed = structuredClone(manifest);
  changed.runtime.integrity = changed.runtime.integrity.replace(/^sha512-./, 'sha512-A');
  assert.throws(() => validateManifest(changed), /registry signature verification failed/);
});

test('offline verification rejects a self-authorized replacement key and signature', () => {
  const changed = structuredClone(manifest);
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const signer = createSign('SHA256');
  signer.end(`${changed.runtime.package}@${changed.runtime.version}:${changed.runtime.integrity}`);
  changed.runtime.registrySignature.keyid = `SHA256:${'A'.repeat(43)}`;
  changed.runtime.registrySignature.key = publicKey
    .export({ format: 'der', type: 'spki' })
    .toString('base64');
  changed.runtime.registrySignature.sig = signer.sign(privateKey).toString('base64');

  assert.throws(() => validateManifest(changed), /unexpected registry signing key/);
});
