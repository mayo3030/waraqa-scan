// Which release an install is offered.
import { pickRelease } from "../src/lib/updater";

let bad = 0;
const check = (name: string, ok: boolean) => { if (!ok) { bad++; console.log("FAIL", name); } };
const rel = (tag: string, pre: boolean, apk = true) => ({ tag_name: tag, prerelease: pre, body: "", assets: apk ? [{ name: "w.apk", browser_download_url: "u/" + tag }] : [] });
const list = [rel("v1.2.21-test", true), rel("v1.2.20-test", true, false), rel("v1.2.19", false), rel("v1.2.14", false), { tag_name: "v1.2.30", draft: true, assets: [{ name: "x.apk" }] }];

const t = pickRelease(list, "1.2.18-test");
check("test install gets newest test build", t?.name === "1.2.21-test" && t.build === 21);
const n = pickRelease(list, "1.2.14");
check("normal install skips test builds", n?.name === "1.2.19" && n.build === 19);
check("drafts are never offered", pickRelease([{ tag_name: "v1.2.30", draft: true, assets: [{ name: "x.apk", browser_download_url: "u" }] }], "1.2.14-test") === null);
check("a release without an apk is skipped", pickRelease([rel("v1.2.40", false, false)], "1.2.14") === null);
check("empty list", pickRelease([], "1.2.14") === null);

if (bad) { console.log(bad + " updater checks failed"); process.exit(1); }
console.log("updater: all checks passed");
