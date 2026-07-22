# OpenClaw release security review

Review date: 2026-07-21

## Selected candidate

The exact `openclaw@2026.7.1-2` graph in `runtime-lock/package-lock.json` was clean-installed with
Node 22.23.1 and npm 10.9.8. The published artifact identifies official source commit
`0790d9f593ad30c940ed93b5872a8cf6d6f3cf8c`, and the installed CLI reported
`OpenClaw 2026.7.1-2 (0790d9f)`.

The unmodified graph contained `fast-uri@3.1.2`, which is affected by host confusion through failed
IDN canonicalization. Pinning the patched `fast-uri@3.1.3` as a narrow npm override produced:

| Severity | Vulnerable packages |
| --- | ---: |
| Critical | 0 |
| High | 0 |
| Moderate | 6 |
| Total | 6 |

No dependency lacked an integrity hash or exact Git commit. A fresh install completed, the version
and gateway flags used by Viventium remained available, the gateway listened only on loopback,
`GET /health` returned `{"ok":true,"status":"live"}`, Viventium's `/tools/invoke` readiness probe
was exercised separately, and SIGINT shutdown completed cleanly. The parent candidate now treats
only the exact health JSON as readiness; an arbitrary 200, 401, or 404 from another loopback
service is rejected.

OpenClaw advertised the host name over Bonjour during the first loopback smoke. Re-running with the
documented `OPENCLAW_DISABLE_BONJOUR=1` control stopped the advertisement. Every Viventium direct,
Docker, E2B, and workstation runtime must set that control; loopback binding alone is insufficient.

The remaining moderate packages are `@google/genai`, `@hono/node-server`,
`@modelcontextprotocol/sdk`, `@openclaw/ai`, `openclaw`, and `protobufjs`. They require tracked
follow-up and full bridge/channel QA but do not fail the critical/high dependency gate.

## Rejected historical runtime

The former parent configuration named `openclaw@2026.2.9`. Its frozen graph reported 3 critical
and 7 high vulnerable packages, including direct OpenClaw, Baileys message-spoofing, and tar
findings. It is not release-eligible and must never be used as a fallback. The current parent
candidate instead consumes the reviewed `2026.7.1-2` lock across direct, Docker, E2B, and
GlassHive-workstation paths and fails closed on a mismatch.

The nested candidate remains `releaseApproved: false` until its commits and the parent pin are
published in order and the standalone bridge passes Docker, native, E2B, account,
message-channel, persistence, recovery, upgrade, and uninstall QA through supported entrypoints.
Never install `openclaw@latest`.

## Reproduction

```sh
npm ci --omit=dev --prefix runtime-lock
npm audit --omit=dev --prefix runtime-lock
runtime-lock/node_modules/.bin/openclaw --version
```

Primary evidence:

- npm metadata: <https://registry.npmjs.org/openclaw/2026.2.9>
- current npm metadata: <https://registry.npmjs.org/openclaw/2026.7.1-2>
- fast-uri advisory: <https://github.com/advisories/GHSA-4c8g-83qw-93j6>
- Baileys advisory: <https://github.com/WhiskeySockets/Baileys/security/advisories/GHSA-qvv5-jq5g-4cgg>
- npm audit: <https://docs.npmjs.com/cli/v11/commands/npm-audit>
