import { describe, expect, it } from "vitest";

import { profileQuickPickLabel } from "../src/quick-pick-format.js";

describe("profile Quick Pick formatting", () => {
  it("uses a visibly green check for the active profile", () => {
    expect(profileQuickPickLabel({ active: true, label: "Ксюшин" })).toBe(
      "✅ Ксюшин",
    );
  });

  it("keeps inactive profile labels neutral", () => {
    expect(profileQuickPickLabel({ active: false, label: "Сашкин" })).toBe(
      "Сашкин",
    );
  });
});
