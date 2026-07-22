#!/usr/bin/env node

import { createHash, createPublicKey, createVerify } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = resolve(root, 'PROVENANCE.json');
const trustedRegistryKey = Object.freeze({
  keyid: 'SHA256:DhQ8wR5APBvFHLF/+Tc+AYvPOdTpcIDqOhxsBHRwC7U',
  publicKeySha256: 'fb190a462123443500cbcdb6519623e7179e9f38d84ad4e9362b72d2b68b62c1',
});

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function digest(buffer, algorithm, encoding) {
  return createHash(algorithm).update(buffer).digest(encoding);
}

function exact(value, expected, label) {
  assert(value === expected, `${label}: expected ${expected}, received ${value}`);
}

function canonicalBase64(value, label) {
  assert(typeof value === 'string' && /^[A-Za-z0-9+/]+=*$/.test(value), `${label} is invalid`);
  const bytes = Buffer.from(value, 'base64');
  assert(bytes.length > 0 && bytes.toString('base64') === value, `${label} is not canonical base64`);
  return bytes;
}

export function verifyRegistrySignature(runtime) {
  const signature = runtime.registrySignature;
  exact(signature.keytype, 'ecdsa-sha2-nistp256', 'registry key type');
  exact(signature.scheme, 'ecdsa-sha2-nistp256', 'registry signature scheme');
  exact(signature.expires, null, 'registry key expiry');
  exact(signature.keyid, trustedRegistryKey.keyid, 'unexpected registry signing key id');

  const publicKeyBytes = canonicalBase64(signature.key, 'registry public key');
  exact(
    digest(publicKeyBytes, 'sha256', 'hex'),
    trustedRegistryKey.publicKeySha256,
    'unexpected registry signing key material',
  );

  const publicKey = createPublicKey({
    key: publicKeyBytes,
    format: 'der',
    type: 'spki',
  });
  exact(publicKey.asymmetricKeyType, 'ec', 'registry public key algorithm');
  exact(publicKey.asymmetricKeyDetails?.namedCurve, 'prime256v1', 'registry public key curve');

  const verifier = createVerify('SHA256');
  verifier.end(`${runtime.package}@${runtime.version}:${runtime.integrity}`);
  assert(
    verifier.verify(publicKey, canonicalBase64(signature.sig, 'registry signature')),
    'registry signature verification failed',
  );
  return true;
}

export function validateManifest(manifest) {
  exact(manifest.schemaVersion, 1, 'schemaVersion');
  exact(manifest.component, 'openclaw', 'component');
  exact(manifest.repositoryRole, 'runtime-provenance', 'repositoryRole');
  exact(manifest.runtime.delivery, 'npm', 'runtime.delivery');
  exact(manifest.runtime.package, 'openclaw', 'runtime.package');
  assert(/^\d{4}\.\d+\.\d+(?:-\d+)?$/.test(manifest.runtime.version), 'runtime.version is not exact');
  exact(
    manifest.runtime.registryMetadata,
    `https://registry.npmjs.org/openclaw/${manifest.runtime.version}`,
    'registry metadata endpoint',
  );
  exact(
    manifest.runtime.tarball,
    `https://registry.npmjs.org/openclaw/-/openclaw-${manifest.runtime.version}.tgz`,
    'registry tarball endpoint',
  );
  assert(/^sha512-[A-Za-z0-9+/]+=*$/.test(manifest.runtime.integrity), 'runtime.integrity is invalid');
  assert(/^[0-9a-f]{40}$/.test(manifest.runtime.shasum), 'runtime.shasum is invalid');
  exact(
    manifest.runtime.registryKeys,
    'https://registry.npmjs.org/-/npm/v1/keys',
    'registry keys endpoint',
  );
  exact(
    manifest.runtime.source.repository,
    'https://github.com/openclaw/openclaw.git',
    'source repository',
  );
  assert(/^[0-9a-f]{40}$/.test(manifest.runtime.source.commit), 'runtime source commit is invalid');
  assert(/^[0-9a-f]{40}$/.test(manifest.runtime.source.tree), 'runtime source tree is invalid');
  assert(/^v\d{4}\.\d+\.\d+$/.test(manifest.runtime.source.releaseContextTag), 'source release context tag is invalid');
  exact(
    manifest.runtime.source.buildInfoPath,
    'package/dist/build-info.json',
    'artifact build-info path',
  );
  exact(
    manifest.runtime.source.commitApi,
    `https://api.github.com/repos/openclaw/openclaw/git/commits/${manifest.runtime.source.commit}`,
    'source commit API',
  );
  exact(
    manifest.runtime.source.treeApi,
    `https://api.github.com/repos/openclaw/openclaw/git/trees/${manifest.runtime.source.tree}`,
    'source tree API',
  );
  exact(manifest.currentTree.runtimeSource, false, 'currentTree.runtimeSource');
  exact(manifest.dependencyLock.file, 'runtime-lock/package-lock.json', 'dependencyLock.file');
  assert(/^[0-9a-f]{64}$/.test(manifest.dependencyLock.sha256), 'dependency lock hash is invalid');
  exact(manifest.dependencyLock.releaseApproved, false, 'dependencyLock.releaseApproved');
  exact(manifest.dependencyLock.highCriticalGate, 'pass', 'dependencyLock.highCriticalGate');
  exact(manifest.dependencyLock.overrides?.['fast-uri'], '3.1.3', 'fast-uri override');
  verifyRegistrySignature(manifest.runtime);
  return manifest;
}

function validateDependencyLock(manifest, lockBytes) {
  exact(digest(lockBytes, 'sha256', 'hex'), manifest.dependencyLock.sha256, 'dependency lock sha256');
  const lock = JSON.parse(lockBytes);
  exact(lock.lockfileVersion, 3, 'dependency lock version');
  exact(lock.packages?.['']?.dependencies?.openclaw, manifest.runtime.tarball, 'locked root request');
  exact(lock.packages?.['node_modules/openclaw']?.version, manifest.runtime.version, 'locked OpenClaw version');
  exact(lock.packages?.['node_modules/openclaw']?.resolved, manifest.runtime.tarball, 'locked OpenClaw tarball');
  exact(lock.packages?.['node_modules/openclaw']?.integrity, manifest.runtime.integrity, 'locked OpenClaw integrity');
  exact(
    lock.packages?.['node_modules/openclaw/node_modules/fast-uri']?.version ??
      lock.packages?.['node_modules/fast-uri']?.version,
    manifest.dependencyLock.overrides['fast-uri'],
    'locked fast-uri remediation',
  );

  for (const [name, entry] of Object.entries(lock.packages || {})) {
    if (!entry.resolved || entry.integrity) continue;
    assert(
      /^git\+(?:https|ssh):\/\/[^#]+#[0-9a-f]{40}$/.test(entry.resolved),
      `${name || '<root>'} lacks an integrity or exact Git commit`,
    );
  }
}

function tarEntry(gzipBytes, expectedPath) {
  const archive = gunzipSync(gzipBytes);
  for (let offset = 0; offset + 512 <= archive.length; ) {
    const header = archive.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const field = (start, end) => header.subarray(start, end).toString('utf8').replace(/\0.*$/s, '');
    const name = field(0, 100);
    const prefix = field(345, 500);
    const path = prefix ? `${prefix}/${name}` : name;
    const size = Number.parseInt(field(124, 136).trim() || '0', 8);
    assert(Number.isSafeInteger(size) && size >= 0, `invalid tar size for ${path}`);
    const dataStart = offset + 512;
    if (path === expectedPath) return archive.subarray(dataStart, dataStart + size);
    offset = dataStart + Math.ceil(size / 512) * 512;
  }
  throw new Error(`${expectedPath} is absent from npm tarball`);
}

async function fetchOk(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      'user-agent': 'ProjectViventium-provenance-verifier',
      ...(options.headers || {}),
    },
  });
  assert(response.ok, `${url}: HTTP ${response.status}`);
  return response;
}

async function verifyOnline(manifest) {
  const metadata = await (await fetchOk(manifest.runtime.registryMetadata)).json();
  exact(metadata.name, manifest.runtime.package, 'registry package');
  exact(metadata.version, manifest.runtime.version, 'registry version');
  exact(metadata.license, manifest.license.spdx, 'registry license');
  exact(metadata.dist.tarball, manifest.runtime.tarball, 'registry tarball');
  exact(metadata.dist.integrity, manifest.runtime.integrity, 'registry integrity');
  exact(metadata.dist.shasum, manifest.runtime.shasum, 'registry shasum');

  const signature = (metadata.dist.signatures || []).find(
    (candidate) => candidate.keyid === manifest.runtime.registrySignature.keyid,
  );
  assert(signature, 'expected npm registry signature is absent');
  exact(signature.sig, manifest.runtime.registrySignature.sig, 'registry signature');

  const registryKeys = await (await fetchOk(manifest.runtime.registryKeys)).json();
  const registryKey = (registryKeys.keys || []).find(
    (candidate) => candidate.keyid === manifest.runtime.registrySignature.keyid,
  );
  assert(registryKey, 'expected npm registry public key is absent');
  for (const field of ['keytype', 'scheme', 'key', 'expires']) {
    exact(registryKey[field], manifest.runtime.registrySignature[field], `registry key ${field}`);
  }

  const tarball = Buffer.from(await (await fetchOk(manifest.runtime.tarball)).arrayBuffer());
  exact(digest(tarball, 'sha1', 'hex'), manifest.runtime.shasum, 'tarball sha1');
  exact(`sha512-${digest(tarball, 'sha512', 'base64')}`, manifest.runtime.integrity, 'tarball sha512');
  const buildInfo = JSON.parse(tarEntry(tarball, manifest.runtime.source.buildInfoPath));
  exact(buildInfo.version, manifest.runtime.version, 'artifact build version');
  exact(buildInfo.commit, manifest.runtime.source.commit, 'artifact build source commit');

  const commit = await (await fetchOk(manifest.runtime.source.commitApi)).json();
  exact(commit.sha, manifest.runtime.source.commit, 'GitHub source commit');
  exact(commit.tree?.sha, manifest.runtime.source.tree, 'GitHub source tree');

  const tree = await (await fetchOk(manifest.runtime.source.treeApi)).json();
  exact(tree.sha, manifest.runtime.source.tree, 'GitHub source tree object');
}

async function main() {
  const manifest = validateManifest(JSON.parse(await readFile(manifestPath, 'utf8')));
  validateDependencyLock(manifest, await readFile(resolve(root, manifest.dependencyLock.file)));
  if (!process.argv.includes('--offline')) {
    await verifyOnline(manifest);
  }
  console.log(
    `PASS openclaw provenance ${manifest.runtime.version} ${manifest.runtime.source.commit}`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
