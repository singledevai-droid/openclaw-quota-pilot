import { readFile } from "node:fs/promises";

const rootPackage = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);
const tag = process.argv[2] ?? `v${rootPackage.version}`;
if (!/^v\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(tag ?? "")) {
  throw new Error(`Invalid release tag: ${tag ?? "<missing>"}`);
}

const files = [
  "package.json",
  "packages/openclaw-plugin/package.json",
  "packages/openclaw-plugin/openclaw.plugin.json",
  "packages/vscode-extension/package.json",
];
const expected = tag.slice(1);

for (const file of files) {
  const data = JSON.parse(await readFile(new URL(`../${file}`, import.meta.url), "utf8"));
  if (data.version !== expected) {
    throw new Error(`${file} has version ${data.version}; expected ${expected}`);
  }
}

const extensionPackage = JSON.parse(
  await readFile(new URL("../packages/vscode-extension/package.json", import.meta.url), "utf8"),
);
if (!extensionPackage.scripts?.package?.includes(`-${expected}.vsix`)) {
  throw new Error("VSIX output filename does not match the release version");
}

console.log(`Release metadata matches ${tag}.`);
