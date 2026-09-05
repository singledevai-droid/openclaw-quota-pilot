import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const VERSION_HEADING = /^## (\d+\.\d+\.\d+)(?:\s+-[^\n]*)?$/gm;

export function changelogSections(markdown) {
  const headings = [...markdown.matchAll(VERSION_HEADING)];
  return headings.map((heading, index) => {
    const start = heading.index;
    const end = headings[index + 1]?.index ?? markdown.length;
    return {
      version: heading[1],
      markdown: markdown.slice(start, end).trim(),
    };
  });
}

export function renderReleaseNotes(
  markdown,
  { currentTag, previousTag = null, repository },
) {
  const currentVersion = currentTag.replace(/^v/, "");
  const previousVersion = previousTag?.replace(/^v/, "") ?? null;
  const sections = changelogSections(markdown);
  const currentIndex = sections.findIndex(
    (section) => section.version === currentVersion,
  );
  if (currentIndex === -1) {
    throw new Error(`CHANGELOG.md has no section for ${currentVersion}`);
  }

  const previousIndex = previousVersion
    ? sections.findIndex((section) => section.version === previousVersion)
    : sections.length;
  if (previousVersion && previousIndex === -1) {
    throw new Error(`CHANGELOG.md has no section for ${previousVersion}`);
  }
  if (previousIndex <= currentIndex) {
    throw new Error(`${previousTag} must precede ${currentTag} in CHANGELOG.md`);
  }

  const changes = sections
    .slice(currentIndex, previousIndex)
    .map((section) => section.markdown.replace(/^## /, "### "))
    .join("\n\n");
  const compare = previousTag
    ? `\n\n**Full changelog:** https://github.com/${repository}/compare/${previousTag}...${currentTag}`
    : "";

  return `## What's changed\n\n${changes}\n\n## Install or upgrade\n\n\`\`\`bash\nbash install-release.sh --repo ${repository} --version ${currentTag}\n\`\`\`${compare}\n`;
}

function previousTagFor(currentTag) {
  try {
    return execFileSync(
      "git",
      ["describe", "--tags", "--abbrev=0", `${currentTag}^`],
      { encoding: "utf8" },
    ).trim();
  } catch {
    return null;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const currentTag = process.argv[2];
  if (!currentTag) {
    throw new Error(
      "Usage: node scripts/extract-release-notes.mjs <tag> [previous-tag]",
    );
  }
  const previousTag = process.argv[3] ?? previousTagFor(currentTag);
  const repository =
    process.env.GITHUB_REPOSITORY ??
    "singledevai-droid/openclaw-quota-pilot";
  const changelog = readFileSync("CHANGELOG.md", "utf8");
  process.stdout.write(
    renderReleaseNotes(changelog, { currentTag, previousTag, repository }),
  );
}
