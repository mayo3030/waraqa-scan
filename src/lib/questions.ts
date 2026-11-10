// Incorrect Question: splits read text into numbered questions.

const START = /^\s*(?:(?:Q|Question|س|سؤال)\s*\.?\s*[0-9٠-٩]{1,3}\b|\(?[0-9٠-٩]{1,3}\s*[.)\-:،]\s*|[0-9٠-٩]{1,3}\s*[-–]\s+)/i;

/** One string per question. Lines before the first number are dropped as headings. */
export function splitQuestions(text: string): string[] {
  const lines = text.split(/\r?\n/);
  const out: string[] = [];
  let cur: string[] | null = null;
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    if (START.test(line)) {
      if (cur) out.push(cur.join("\n").trim());
      cur = [line.trim()];
    } else if (cur && line.trim()) {
      cur.push(line.trim());
    }
  }
  if (cur) out.push(cur.join("\n").trim());
  if (out.length >= 2) return out.filter(Boolean);
  // no numbering found: blocks split by empty lines
  return text.split(/\n\s*\n/).map((b) => b.trim()).filter((b) => b.length > 2);
}
