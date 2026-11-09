import { fixVins } from "../src/lib/vin";
const cases: [string, string][] = [
  ["VIN 4T1B11HK5KUOO0000", "VIN 4T1B11HK5KU000000"],
  ["VIN 1HGCM8Z6I3A0O4352 ok", "VIN 1HGCM8Z613A004352 ok"],
  ["ORDINARYWORDSHERE", "ORDINARYWORDSHERE"],
  ["Short 4T1B11", "Short 4T1B11"],
];
let bad = 0;
for (const [i, o] of cases) {
  const r = fixVins(i);
  if (r !== o) { bad++; console.log("FAIL", i, "->", r); }
}
console.log(bad ? `${bad} VIN case(s) failed` : `PASS vin fixes (${cases.length} cases)`);
process.exit(bad ? 1 : 0);
