# Required Viventium parent alignment

This repository records the immutable OpenClaw target. It does not edit the parent Viventium repo.

The parent must fail closed until all runtime consumers use the exact `2026.7.1-2` package and
reviewed dependency lock, set the Bonjour privacy control, and the parent component pin points to
the merged commit from this repository. Vulnerable `2026.2.9` and mutable `latest` are forbidden
fallbacks.

## Required changes

The isolated parent release candidate implements items 1-5 below. They remain acceptance
requirements, not a shipped claim: the nested commits must be published first, the parent must be
repinned to the resulting public commits, and release QA must still pass before item 6 is complete.

1. Replace every `2026.2.9` or `latest` install with exact `2026.7.1-2` plus this repository's
   `runtime-lock/package.json` and `runtime-lock/package-lock.json`. The reviewed override produces
   0 critical and 0 high audit findings; installing the root tarball alone would reintroduce the
   vulnerable unmodified transitive graph.
2. In `viventium_v0_4/MCPs/openclaw-bridge/Dockerfile`:
   - correct the comment that says the compact nested tree is the installed source;
   - install through a committed npm lockfile with `npm ci`, where the root dependency is the exact
     tarball from `PROVENANCE.json`; verify its SHA-512 before installation. Installing the root
     tarball globally is not sufficient because npm would still resolve mutable transitive ranges;
   - pin the Python base image by digest and Node to exact `22.23.1` artifacts. The official Node
     SHA-256 values are `9749e988f437343b7fa832c69ded82a312e41a03116d766797ac14f6f9eee578`
     (`linux-x64.tar.xz`) and
     `0294e8b915ab75f92c7513d2fcb830ae06e10684e6c603e99a87dbf8835389c1`
     (`linux-arm64.tar.xz`).
   - set `OPENCLAW_DISABLE_BONJOUR=1`; loopback binding did not prevent native mDNS host-name
     advertising in the real gateway smoke.
3. Replace `openclaw@latest` with the exact reviewed version in:
   - `viventium_v0_4/viventium-openclaw-bridge-start.sh` (status guidance and native install);
   - `viventium_v0_4/MCPs/openclaw-bridge/e2b_runtime.py`;
   - `viventium_v0_4/MCPs/openclaw-bridge/openclaw_manager.py` guidance;
   - the GlassHive workstation sandbox default and its owning requirement doc.
   Set `OPENCLAW_DISABLE_BONJOUR=1` in every corresponding runtime environment.
4. Until all four consumers use the reviewed lock, Easy Install and Custom Settings Install must
   report OpenClaw as unavailable and must not download, start, or silently fall back to another
   version.
5. Add a parent release test that rejects `openclaw@latest` and `2026.2.9`, validates the exact npm
   integrity `sha512-ycF3yPcbjN6bUPeaUx6Mh6vze1hQWoD3CT/wWcmD7a8xaHHHRUaAlaq+lFxMHf1ssEgODVAwjlzYqp2twkYZ7g==`,
   lockfile SHA-256 `e025a05ef3d268747dc293ef54876471d067f22644a8fa26a9139b7d1fe4fbc3`,
   `fast-uri@3.1.3`, and asserts Docker, native, E2B, and workstation paths agree and disable
   Bonjour.
6. Update the OpenClaw `ref` in `components.lock.json` to the reviewed nested commit only after it
   is merged. `release/native-payload/components.json` does not enumerate this optional component;
   do not add a false native-payload pin. Treat this compact repo as provenance metadata, not as
   embedded upstream source or the npm install payload.

## Primary sources

- npm registry metadata: <https://registry.npmjs.org/openclaw/2026.7.1-2>
- embedded source commit: <https://github.com/openclaw/openclaw/commit/0790d9f593ad30c940ed93b5872a8cf6d6f3cf8c>
- npm integrity behavior: <https://docs.npmjs.com/cli/v10/commands/npm-publish>
- npm signature verification: <https://docs.npmjs.com/cli/v11/commands/npm-audit#audit-signatures>
- npm reproducible clean installs: <https://docs.npmjs.com/cli/v11/commands/npm-ci>
- Node.js 22.23.1 checksums: <https://nodejs.org/dist/v22.23.1/SHASUMS256.txt>
- rejected 2026.2.9 audit and selected-candidate evidence: [SECURITY_REVIEW.md](SECURITY_REVIEW.md)
