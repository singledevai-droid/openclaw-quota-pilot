# Release process

Maintainers publish immutable GitHub releases from version tags.

1. Update the same version in the root package, backend package, backend
   manifest, VS Code package, and VSIX output filename.
2. Add the release notes to `CHANGELOG.md`.
3. Run `npm ci && npm run verify && npm run release:checksums`.
4. Inspect `artifacts/SHA256SUMS` and both package contents.
5. Commit the release and create an annotated `v<version>` tag.
6. Push the commit and tag. The release workflow verifies, rebuilds, checksums,
   and uploads the backend TGZ, VSIX, installer, and `SHA256SUMS`.

Never publish from a dirty worktree, reuse a tag, or upload artifacts built
outside the tagged source. GitHub repository publication and tag pushes are
external actions and require the repository owner's explicit approval.
