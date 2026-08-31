import assert from "node:assert/strict";

import {
  changelogSections,
  renderReleaseNotes,
} from "./extract-release-notes.mjs";

const changelog = `# Changelog

## Unreleased

- Pending work.

## 0.3.9 - 2026-08-31

- Green active-profile check.

## 0.3.8 - 2026-08-31

- Green active-profile hover marker.

## 0.3.7 - 2026-08-31

- Hover-only status tooltip.

## 0.3.6 - 2026-08-30

- Previous public release.
`;

assert.deepEqual(
  changelogSections(changelog).map((section) => section.version),
  ["0.3.9", "0.3.8", "0.3.7", "0.3.6"],
);

const notes = renderReleaseNotes(changelog, {
  currentTag: "v0.3.9",
  previousTag: "v0.3.6",
  repository: "owner/project",
});

assert.match(notes, /### 0\.3\.9/);
assert.match(notes, /### 0\.3\.8/);
assert.match(notes, /### 0\.3\.7/);
assert.doesNotMatch(notes, /### 0\.3\.6/);
assert.doesNotMatch(notes, /Pending work/);
assert.match(notes, /--version v0\.3\.9/);
assert.match(notes, /compare\/v0\.3\.6\.\.\.v0\.3\.9/);

console.log("Release-note generation tests passed.");
