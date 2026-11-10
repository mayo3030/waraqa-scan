// Live page outline: placing corners on the screen, telling a real page from noise,
// smoothing, holding through a missed frame, steady, and auto capture once per page.
import { AutoShot, coverMap, frameChange, OutlineTracker, plausible } from "../src/lib/liveedge";
import type { Quad } from "../src/lib/geometry";

let bad = 0;
const check = (name: string, ok: boolean) => { if (!ok) { bad++; console.log("FAIL", name); } };
const Q = (...p: number[]): Quad => [{ x: p[0], y: p[1] }, { x: p[2], y: p[3] }, { x: p[4], y: p[5] }, { x: p[6], y: p[7] }];
const near = (a: number, b: number, e = 0.01) => Math.abs(a - b) < e;

// A 400 x 300 frame shown on a 390 x 700 phone screen with object-fit: cover:
// scale 700 / 300 = 2.333, the frame is 933 wide, 271.7 cut off each side.
const m = coverMap(Q(0, 0, 400, 0, 400, 300, 0, 300), 400, 300, 390, 700);
check("cover: top-left", near(m[0].x, -271.67) && near(m[0].y, 0));
check("cover: bottom-right", near(m[2].x, 661.67) && near(m[2].y, 700));
const mid = coverMap(Q(200, 150, 200, 150, 200, 150, 200, 150), 400, 300, 390, 700);
check("cover: middle stays in the middle", near(mid[0].x, 195) && near(mid[0].y, 350));

// Plausible pages
const page = Q(80, 40, 330, 50, 340, 270, 70, 260);
check("a page is plausible", plausible(page, 400, 300));
check("a tiny box is not", !plausible(Q(10, 10, 40, 10, 40, 40, 10, 40), 400, 300));
check("a bow tie is not", !plausible(Q(80, 40, 340, 270, 330, 50, 70, 260), 400, 300));
check("a sliver is not", !plausible(Q(0, 0, 400, 0, 400, 12, 0, 12), 400, 300));

// Tracking
const t = new OutlineTracker(450, 900);
let r = t.update(null, 400, 300, 0);
check("nothing found: none", r.state === "none" && r.quad === null);
r = t.update(page, 400, 300, 100);
check("first page: found, right where it is", r.state === "found" && r.quad![0].x === 80);
const nudged = Q(84, 42, 334, 52, 344, 272, 74, 262);
r = t.update(nudged, 400, 300, 220);
check("small move is smoothed", r.quad![0].x > 80 && r.quad![0].x < 84);
for (let now = 340; now <= 1300; now += 120) r = t.update(nudged, 400, 300, now);
check(`held still: steady (${r.state})`, r.state === "steady");
r = t.update(null, 400, 300, 1420);
check("one missed frame: outline kept, not steady", r.quad !== null && r.state === "found");
r = t.update(nudged, 400, 300, 1540);
check("back again", r.quad !== null);
r = t.update(null, 400, 300, 1660);
r = t.update(null, 400, 300, 2200);
check("gone for a while: none", r.state === "none" && r.quad === null);
r = t.update(page, 400, 300, 2300);
const other = Q(20, 20, 200, 25, 210, 280, 15, 275);
r = t.update(other, 400, 300, 2420);
check("another page: jumps there", r.quad![0].x === 20 && r.state === "found");
r = t.update(Q(10, 10, 40, 10, 40, 40, 10, 40), 400, 300, 2540);
check("noise does not move the outline", r.quad![0].x === 20);

// Frame change
const f1 = new Uint8ClampedArray(400 * 300 * 4).fill(200);
const f2 = new Uint8ClampedArray(f1).fill(140);
check("same frame: no change", frameChange(f1, f1) === 0);
check("different frame: big change", frameChange(f1, f2) > 50);

// Auto capture
const a = new AutoShot(1500, 22);
check("not steady: no photo", !a.next("found", f1, 0));
check("steady: photo", a.next("steady", f1, 1000));
check("waiting for the next page", a.waiting);
check("still steady on the same page: no second photo", !a.next("steady", f1, 3000));
check("page taken away", !a.next("none", f1, 3200) && !a.waiting);
check("new page steady: photo", a.next("steady", f1, 4000));
check("too soon after the last one: no photo", !a.next("steady", f2, 4500));
check("same spot, clearly different picture: photo", a.next("steady", f2, 6000));

if (bad) { console.log(bad + " live outline checks failed"); process.exit(1); }
console.log("liveedge: all checks passed");
