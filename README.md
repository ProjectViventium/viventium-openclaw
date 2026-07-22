# viventium-openclaw

Public Project Viventium provenance and patch companion for the OpenClaw runtime.

## Runtime contract

Viventium's reviewed OpenClaw target is the exact public npm package `openclaw@2026.7.1-2`:

- npm tarball: `https://registry.npmjs.org/openclaw/-/openclaw-2026.7.1-2.tgz`
- npm integrity: `sha512-ycF3yPcbjN6bUPeaUx6Mh6vze1hQWoD3CT/wWcmD7a8xaHHHRUaAlaq+lFxMHf1ssEgODVAwjlzYqp2twkYZ7g==`
- artifact build source commit: `0790d9f593ad30c940ed93b5872a8cf6d6f3cf8c`
- upstream source tree: `f855f357444931631be29141026876741ebc7dbd`
- upstream repository: <https://github.com/openclaw/openclaw>
- license: MIT

The official source is recorded by immutable upstream commit and tree hashes in
`PROVENANCE.json`. It is intentionally not copied into this repository's Git history. The compact
tree at `HEAD` is a Project Viventium provenance and dependency-lock surface; it is **not** a copy
of the installed npm package or upstream source and must not be described as one.

Run the local and network-backed checks with:

```sh
node --test tests/provenance.test.mjs
node scripts/verify-provenance.mjs
```

The verifier checks the npm registry signature cryptographically against the recorded official npm
ECDSA P-256 public key and validates the frozen dependency lock without requiring local upstream
source ancestry. The online check additionally verifies npm metadata, both tarball hashes, embedded
build-info commit, the official GitHub commit-to-tree mapping, and the current npm registry key
record. This proves signed root-artifact identity and remote source traceability; it does not claim
that a registry signature makes the package safe or that a root tarball alone freezes its
transitive dependency graph.

`runtime-lock/package-lock.json` freezes the selected dependency graph. The narrow `fast-uri@3.1.3`
override remediates the only high advisory in the unmodified graph. A clean Node 22.23.1 install,
CLI/bridge-compatible gateway smoke, and production audit passed with 0 critical and 0 high
findings; 6 moderate findings remain documented in [SECURITY_REVIEW.md](SECURITY_REVIEW.md).

## Current release status

The current parent candidate consumes this exact lock across its direct, Docker, E2B, and
GlassHive-workstation consumers, rejects mutable or mismatched fallbacks, and disables Bonjour.
Those source changes satisfy the integration contract in
[PARENT_INTEGRATION.md](PARENT_INTEGRATION.md), but they are not yet public, merged, or a supported
install feature. The bridge remains a standalone lab surface and `releaseApproved` remains false
until the nested commits and parent pin are published in order and the account, message-channel,
persistence, recovery, upgrade, and uninstall lifecycle is proven through supported entrypoints.

## License

OpenClaw is MIT licensed. Preserve the upstream copyright, license, and incorporated-code notices
in copies or substantial portions of the software. See [LICENSE](LICENSE) and
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
