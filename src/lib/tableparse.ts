// Turns read text into rows and columns for the Excel export.
// Columns are split on tabs, runs of 2+ spaces, or " | ".

export function textToTable(text: string): string[][] {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+$/, "")).filter((l) => l.trim());
  const rows = lines.map((l) => l.split(/\t| {2,}| \| /).map((c) => c.trim()).filter((c, i, a) => c || i < a.length - 1));
  // Numbers with thousands separators or currency stay as text in the cell;
  // the sheet converts plain numbers itself.
  return rows;
}

/** Plain numbers become numbers so Excel can add them up. */
export function cellValue(s: string): string | number {
  const t = s.replace(/[$,]/g, "");
  return /^-?\d+(\.\d+)?$/.test(t) && t.length < 16 ? Number(t) : s;
}
