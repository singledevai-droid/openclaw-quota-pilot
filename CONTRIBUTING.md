# Contributing

1. Use Node.js 22.22.3 or newer.
2. Run `npm ci`.
3. Run `npm run verify` before opening a pull request.
4. Never add credential fixtures copied from a real OpenClaw installation.
5. Use synthetic OAuth tokens and account IDs in tests.
6. Keep automatic routing opt-in and preserve manual mode semantics.

Pull requests that change credential access, RPC payloads, or profile mutation
must include a security-boundary test and a rollback note.
