# Release process

Maintainers publish immutable GitHub releases from version tags.

1. Update the same version in the root package, backend package, backend
   manifest, VS Code package, and VSIX output filename.
2. Add complete operator-facing release notes to `CHANGELOG.md`. Describe
   behavior changes, fixes, upgrade impact, and validation rather than only
   commits or dependency updates.
3. Run `npm ci && npm run verify && npm run release:checksums`.
4. Inspect `artifacts/SHA256SUMS` and both package contents.
5. Commit the release and create an annotated `v<version>` tag.
6. Preview the exact public description with
   `node scripts/extract-release-notes.mjs v<version> [previous-tag]`.
7. Push the commit and tag. The release workflow verifies, rebuilds, checksums,
   generates the public description from every changelog section since the
   previous tag, and uploads the backend TGZ, VSIX, installer, and
   `SHA256SUMS`.
8. Open the published GitHub Release and verify both its operator-facing
   description and all four expected assets. A successful workflow alone is
   not sufficient release validation.

GitHub's pull-request-generated notes may supplement a release, but they must
never replace the changelog-derived description: direct commits and locally
developed fixes are otherwise omitted.

Never publish from a dirty worktree, reuse a tag, or upload artifacts built
outside the tagged source. GitHub repository publication and tag pushes are
external actions and require the repository owner's explicit approval.
