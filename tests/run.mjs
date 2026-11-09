// Bundles a TS test with esbuild and runs it in Node.
import { build } from "esbuild";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const entry = process.argv[2];
const out = fileURLToPath(new URL("./.build/" + entry.replace(/\W/g, "_") + ".mjs", import.meta.url));
await build({ entryPoints: [entry], bundle: true, platform: "node", format: "esm", outfile: out, external: ["@techstark/opencv-js"], logLevel: "error",
  banner: { js: "import.meta.url;" } });
const r = spawnSync(process.execPath, [out], { stdio: "inherit", env: process.env });
process.exit(r.status ?? 1);
