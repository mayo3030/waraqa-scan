// VINs never use the letters I, O or Q, so OCR misreads of 1 and 0
// inside a 17-character VIN can be fixed safely.
export function fixVins(text: string): string {
  return text.replace(/\b[A-Z0-9]{17}\b/g, (tok) => {
    const digits = (tok.match(/[0-9]/g) ?? []).length;
    if (digits < 4 || !/[IOQ]/.test(tok)) return tok;
    return tok.replace(/[OQ]/g, "0").replace(/I/g, "1");
  });
}
