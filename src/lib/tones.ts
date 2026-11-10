// One colour family per kind of tool, so the grids read at a glance.
export type Tone = "teal" | "blue" | "violet" | "rose" | "orange" | "green" | "amber" | "sky" | "red" | "slate";

const GROUPS: Record<Exclude<Tone, "slate">, string[]> = {
  teal: ["Smart Scan", "Scan", "ID Cards", "Whiteboard", "Mega Scan", "Extract Text", "Sign"],
  blue: ["To Word", "ID Photo", "ID Photo Maker", "Import Files", "Watermark", "Reorder", "Reorder Pages", "Extract Pages", "Translate"],
  green: ["To Excel", "Lock", "Lock with Password", "Smart Erase"],
  orange: ["To PPT", "Slides", "Restore Photo", "Greeting Card", "Compress"],
  red: ["To PDF", "PDF to Images", "Erase Marks"],
  violet: ["AI HD", "AI Chat", "AI Restore", "AI Colorize", "Formula", "Formula to LaTeX", "Incorrect Question"],
  amber: ["Scan Code", "CountCam", "Print", "Tags & Folder", "Receipt", "All"],
  sky: ["Import Images", "Images", "Long Image", "PDF to Long Image", "Book", "Merge", "Merge Files", "Timestamp"],
  rose: ["Colorize", "Remove Background"],
};

const BY_LABEL = new Map<string, Tone>();
for (const [tone, labels] of Object.entries(GROUPS)) for (const l of labels) BY_LABEL.set(l, tone as Tone);

export const toneOf = (label: string): Tone => BY_LABEL.get(label) ?? "slate";
