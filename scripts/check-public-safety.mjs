import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";

const root = new URL("../", import.meta.url);
const ignoredDirectories = new Set([
  ".git",
  "artifacts",
  "coverage",
  "dist",
  "graphify-out",
  "node_modules",
]);
const textExtensions = new Set([
  "",
  ".json",
  ".json5",
  ".md",
  ".mjs",
  ".sh",
  ".ts",
  ".txt",
  ".yaml",
  ".yml",
]);
const forbiddenFileExtensions = new Set([
  ".db",
  ".pem",
  ".sqlite",
  ".sqlite3",
]);
const checks = [
  ["private home path", /\/home\/(?!example(?:\/|\b))[^\s'"`]+/i],
  ["private key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ["OAuth bearer token", /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}/i],
  ["OpenAI API key", /\bsk-[A-Za-z0-9_-]{20,}\b/],
  ["GitHub token", /\bgh[opusr]_[A-Za-z0-9]{20,}\b/],
];

const failures = [];

async function walk(directoryUrl) {
  for (const entry of await readdir(directoryUrl, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const entryUrl = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, directoryUrl);
    if (entry.isDirectory()) {
      await walk(entryUrl);
      continue;
    }

    const path = relative(root.pathname, entryUrl.pathname);
    const extension = extname(entry.name).toLowerCase();
    if (forbiddenFileExtensions.has(extension) || entry.name.startsWith(".env")) {
      if (entry.name !== ".env.example") failures.push(`${path}: sensitive file type`);
      continue;
    }
    if (!textExtensions.has(extension)) continue;

    const content = await readFile(entryUrl, "utf8");
    for (const [label, pattern] of checks) {
      if (pattern.test(content)) failures.push(`${path}: ${label}`);
    }

    for (const match of content.matchAll(/[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,})/gi)) {
      const domain = match[1].toLowerCase();
      if (domain !== "example.com" && domain !== "users.noreply.github.com") {
        failures.push(`${path}: non-example email address`);
      }
    }
  }
}

await walk(root);

if (failures.length > 0) {
  throw new Error(`Public safety check failed:\n${[...new Set(failures)].join("\n")}`);
}

console.log("Public safety check passed: no obvious credentials or private identifiers found.");
