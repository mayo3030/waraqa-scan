// Turns dist-demo/index.html into a page body for the Claude Artifact tool
// (the tool adds its own doctype/html/head/body wrapper).
import { readFileSync, writeFileSync } from "node:fs";
const html = readFileSync("dist-demo/index.html", "utf8");
const hs = html.indexOf("<head>") + 6;
const bodyOpen = html.lastIndexOf("<body>");
const he = html.lastIndexOf("</head>", bodyOpen);
const be = html.lastIndexOf("</body>");
const head = html.slice(hs, he)
  .replace(/<meta charset[^>]*>\s*/i, "")
  .replace(/<meta name="viewport"[^>]*>\s*/i, "");
const body = html.slice(bodyOpen + 6, be);
const out = head.trim() + "\n" + body.trim() + "\n";
writeFileSync("dist-demo/page.html", out);
console.log("page.html", (Buffer.byteLength(out) / 1024) | 0, "KB");
