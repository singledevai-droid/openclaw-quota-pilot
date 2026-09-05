# Security policy

## Credential boundary

Quota Pilot reads OpenAI OAuth credentials only inside the OpenClaw host
process or its local Node.js runtime. It uses the access token solely for a
GET request to:

```text
https://chatgpt.com/backend-api/wham/usage
```

The plugin never returns, logs, caches, or sends access tokens, refresh tokens,
account IDs, or raw credential records to VS Code. RPC responses contain only
profile identifiers, optional operator-defined aliases, health state, quota
percentages, and reset times.

## Local storage

- OpenClaw's credential SQLite database is opened read-only.
- Quota Pilot persists only sanitized routing state.
- State files are created with mode `0600`.
- Profile changes use OpenClaw's supported session patch API and auth-order
  CLI, which owns its locking and validation.

## Network boundary

The backend makes no inbound listener of its own. The VS Code extension talks
to the authenticated local OpenClaw Gateway through `openclaw gateway call`.
Do not expose the Gateway without its normal authentication and TLS controls.

## Reporting

Do not open a public issue containing `openclaw.json`, SQLite databases,
session files, bearer tokens, refresh tokens, account IDs, or full diagnostic
bundles. Redact profile identifiers if they contain private email addresses.

For a suspected vulnerability, open the repository's **Security** tab, choose
**Advisories**, and create a private draft advisory. Include the smallest safe
reproduction and affected versions. Do not test against accounts or hosts you
do not own.
