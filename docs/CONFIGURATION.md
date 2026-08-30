# Configuration reference

## OpenClaw backend

Backend configuration lives in `plugins.entries.quota-pilot.config`:

```json5
{
  plugins: {
    entries: {
      "quota-pilot": {
        enabled: true,
        config: {
          agentId: "main",
          sessionKey: "agent:main:main",
          pollIntervalSeconds: 30,
          reservePercent: 15,
          switchHysteresisPercent: 5,
          requestTimeoutMs: 4000,
          autoEnabledByDefault: false,
          openclawExecutable: "openclaw",
          profileAliases: {
            "openai:account@example.com": "Work account"
          }
        }
      }
    }
  }
}
```

| Setting | Default | Purpose |
| --- | ---: | --- |
| `agentId` | `main` | Backend default agent. |
| `sessionKey` | `agent:main:main` | Default route used by backend polling. |
| `pollIntervalSeconds` | `30` | Quota refresh interval, from 30 to 3600 seconds. |
| `reservePercent` | `15` | Remaining bottleneck quota that triggers automatic routing. |
| `switchHysteresisPercent` | `5` | Minimum candidate improvement required for a switch. |
| `requestTimeoutMs` | `4000` | Timeout for the OpenAI quota request, from 1000 to 15000 ms. |
| `autoEnabledByDefault` | `false` | Initial automatic profile-routing mode. |
| `openclawExecutable` | `openclaw` | CLI name or absolute path used by the backend. |
| `profileAliases` | `{}` | Optional operator-defined labels keyed by profile ID. |

Keep `autoEnabledByDefault` false on shared or production hosts until routing
has been verified manually.

## VS Code extension

| Setting | Default | Purpose |
| --- | ---: | --- |
| `quotaPilot.openclawExecutable` | `openclaw` | CLI available to the extension host. |
| `quotaPilot.agentId` | `main` | Initial/default agent. |
| `quotaPilot.sessionKey` | empty | Optional default-agent route override. |
| `quotaPilot.autoDetectAgent` | `true` | Follow the active terminal/workspace agent. |
| `quotaPilot.pollIntervalSeconds` | `30` | UI refresh interval, from 30 to 3600 seconds. |
| `quotaPilot.profileLabels` | `{}` | Machine-local labels keyed by profile ID. |
| `quotaPilot.gatewayTimeoutMs` | `10000` | Gateway CLI timeout, from 2000 to 60000 ms. |
| `quotaPilot.showMode` | `true` | Show `PROFILE AUTO` or `PROFILE FIXED`. |

Leave `quotaPilot.sessionKey` empty unless the default agent needs a custom
session. Agents selected from the menu use `agent:<agentId>:main`.

## Agent detection priority

1. Manual override for the active terminal tab.
2. Active terminal name matched to an exact agent ID or unique prefix.
3. Active terminal cwd matched to an agent workspace.
4. Current VS Code workspace folder.
5. Active editor path.
6. Configured default agent.

Manual selection in one terminal does not change another terminal's override.
Separate VS Code windows also retain independent workspace state.
