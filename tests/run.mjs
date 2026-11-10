// Bundles a TS test with esbuild and runs it in Node.
import { build } from "esbuild";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const entry = process.argv[2];
const out = fileURLToPath(new URL("./.build/" + entry.replace(/\W/g, "_") + ".mjs", import.meta.url));
await build({ entryPoints: [entry], bundle: true, platform: "node", format: "esm", outfile: out, external: ["@techstark/opencv-js", "jspdf", "pdfjs-dist", "pdfjs-dist/*"], logLevel: "error",
  banner: { js: "import { createRequire as __cr } from \"node:module\"; const require = __cr(import.meta.url);" } });
const r = spawnSync(process.execPath, [out, ...process.argv.slice(3)], { stdio: "inherit", env: process.env });
process.exit(r.status ?? 1);
