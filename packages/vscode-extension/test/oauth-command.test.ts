import { describe, expect, it } from "vitest";

import {
  buildOAuthLoginCommand,
  shellQuote,
} from "../src/oauth-command.js";

describe("OAuth login command", () => {
  it("targets exactly one agent and expired profile", () => {
    expect(
      buildOAuthLoginCommand(
        "openclaw",
        "wb-assistant",
        "openai:expired@example.com",
      ),
    ).toBe(
      "'openclaw' 'models' 'auth' '--agent' 'wb-assistant' 'login' '--provider' 'openai' '--method' 'oauth' '--profile-id' 'openai:expired@example.com'",
    );
  });

  it("places the parent auth option before the login subcommand", () => {
    const command = buildOAuthLoginCommand(
      "openclaw",
      "wb-assistant",
      "openai:test@example.com",
    );
    expect(command.indexOf("'--agent'")).toBeLessThan(
      command.indexOf("'login'"),
    );
  });

  it("quotes shell metacharacters instead of executing them", () => {
    expect(shellQuote("openai:o'hara; echo unsafe")).toBe(
      "'openai:o'\\''hara; echo unsafe'",
    );
  });

  it("never adds the provider-wide destructive force option", () => {
    expect(buildOAuthLoginCommand("openclaw", "main", "openai:test"))
      .not.toContain("--force");
  });
});
