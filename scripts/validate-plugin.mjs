import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(import.meta.dirname, "..");
const packageRoot = resolve(root, "packages/openclaw-plugin");
const packageJson = JSON.parse(
  await readFile(resolve(packageRoot, "package.json"), "utf8"),
);
const manifest = JSON.parse(
  await readFile(resolve(packageRoot, "openclaw.plugin.json"), "utf8"),
);

const fail = (message) => {
  throw new Error(`Plugin validation failed: ${message}`);
};

if (manifest.id !== "quota-pilot") fail("manifest id must be quota-pilot");
if (manifest.activation?.onStartup !== true) {
  fail("activation.onStartup must be true for the background monitor");
}
if (manifest.configSchema?.type !== "object") fail("configSchema must be an object");
if (manifest.configSchema?.additionalProperties !== false) {
  fail("configSchema must reject unknown properties");
}
if (packageJson.openclaw?.extensions?.[0] !== "./dist/index.js") {
  fail("package.json must point OpenClaw at ./dist/index.js");
}
if (!String(packageJson.peerDependencies?.openclaw ?? "").includes("2026.7.1-2")) {
  fail("OpenClaw peer compatibility floor is missing");
}

const entry = resolve(packageRoot, "dist/index.js");
await access(entry);
const imported = await import(`${pathToFileURL(entry).href}?validate=${Date.now()}`);
if (imported.default?.id !== "quota-pilot") fail("runtime entry id mismatch");
if (typeof imported.default?.register !== "function") {
  fail("runtime entry does not export register(api)");
}

console.log("OpenClaw plugin package metadata and runtime entry are valid.");
