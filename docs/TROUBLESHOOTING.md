# Troubleshooting

## The status item shows the wrong agent

- Focus the intended integrated terminal, not only its editor.
- Name the terminal after the agent ID or a unique prefix.
- Open the agent's workspace folder in that VS Code window.
- Choose **Resume automatic detection** if the terminal has a manual override.
- Confirm `quotaPilot.autoDetectAgent` is enabled.

The status item renders the last sanitized snapshot immediately, then refreshes
in the background. `PROFILE AUTO` refers to profile routing and is unrelated to
agent detection.

## Switching appears stuck

Wait for the VS Code progress notification and inspect:

```bash
openclaw gateway health
openclaw plugins inspect quota-pilot --runtime --json
```

Increase `quotaPilot.gatewayTimeoutMs` only if the Gateway is healthy but slow.
Do not repeatedly click profiles while one mutation is running.

## OAuth reports an unknown `--agent` option

The parent option must appear before the `login` subcommand:

```bash
openclaw models auth --agent main login \
  --provider openai \
  --method oauth \
  --profile-id openai:account@example.com
```

Quota Pilot 0.3.6 and newer generates this ordering automatically.

## The wrong OpenAI account opens in the browser

The provider page cannot force a particular email identity. Use a private
browser window or sign out first, then choose the exact account shown in the
Quota Pilot terminal message.

## No VS Code CLI was found

Use **Extensions: Install from VSIX...** and select the path printed by the
installer. In Remote SSH, install it on the remote extension host.

## Safe diagnostics

Useful commands:

```bash
openclaw gateway health
openclaw plugins inspect quota-pilot --runtime --json
./scripts/smoke-test.sh
```

Never attach `openclaw.json`, credential databases, session files, raw Gateway
logs, tokens, account IDs, or unredacted profile emails to a public issue.
