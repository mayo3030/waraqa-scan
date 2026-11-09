// Small line icons drawn for this app.
const P = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;
type I = { size?: number };
const svg = (size: number, children: React.ReactNode) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">{children}</svg>
);
export const Camera = ({ size = 22 }: I) => svg(size, <g {...P}><path d="M4 8h3l1.6-2.4h6.8L17 8h3v11H4z" /><circle cx="12" cy="13.2" r="3.6" /></g>);
export const Images = ({ size = 22 }: I) => svg(size, <g {...P}><rect x="3.5" y="5" width="14" height="13" rx="1.5" /><path d="M7 21h13.5V8.5" /><path d="m5 16 4-4 3 3 2-2 3.5 3.5" /></g>);
export const Back = ({ size = 22 }: I) => svg(size, <g {...P}><path d="M14.5 5.5 8 12l6.5 6.5" /></g>);
export const Search = ({ size = 20 }: I) => svg(size, <g {...P}><circle cx="10.5" cy="10.5" r="6" /><path d="m15 15 5 5" /></g>);
export const Rotate = ({ size = 20 }: I) => svg(size, <g {...P}><path d="M19 12a7 7 0 1 1-2.1-5" /><path d="M19.5 4.5V8H16" /></g>);
export const Scan = ({ size = 20 }: I) => svg(size, <g {...P}><path d="M4 9V5h4M16 5h4v4M20 15v4h-4M8 19H4v-4" /><path d="M7 12h10" /></g>);
export const Expand = ({ size = 20 }: I) => svg(size, <g {...P}><rect x="4" y="4" width="16" height="16" rx="1" /></g>);
export const Trash = ({ size = 20 }: I) => svg(size, <g {...P}><path d="M5 7h14M10 7V4.5h4V7M7 7l1 13h8l1-13" /></g>);
export const Left = ({ size = 18 }: I) => svg(size, <g {...P}><path d="M15 6l-6 6 6 6" /></g>);
export const Right = ({ size = 18 }: I) => svg(size, <g {...P}><path d="M9 6l6 6-6 6" /></g>);
export const Text = ({ size = 20 }: I) => svg(size, <g {...P}><path d="M5 6.5V5h14v1.5M12 5v14M9.5 19h5" /></g>);
export const Pdf = ({ size = 20 }: I) => svg(size, <g {...P}><path d="M6 3.5h8l4 4v13H6z" /><path d="M14 3.5v4h4M9 14h6M9 17h4" /></g>);
export const Plus = ({ size = 20 }: I) => svg(size, <g {...P}><path d="M12 5v14M5 12h14" /></g>);
export const Copy = ({ size = 18 }: I) => svg(size, <g {...P}><rect x="8" y="8" width="11" height="12" rx="1.5" /><path d="M5 16V4.5h10" /></g>);
export const Pencil = ({ size = 18 }: I) => svg(size, <g {...P}><path d="M4 20h4L19 9l-4-4L4 16z" /></g>);
export const Download = ({ size = 18 }: I) => svg(size, <g {...P}><path d="M12 4v11M7 10.5l5 5 5-5M5 20h14" /></g>);
export const Refresh = ({ size = 20 }: I) => svg(size, <g {...P}><path d="M19 12a7 7 0 0 1-12.2 4.7M5 12a7 7 0 0 1 12.2-4.7" /><path d="M17.5 3.5v4h-4M6.5 20.5v-4h4" /></g>);
export const Share = ({ size = 18 }: I) => svg(size, <g {...P}><path d="M12 15V4M8 8l4-4 4 4M5 13v7h14v-7" /></g>);

/** The Waraqa mark: a page with a folded corner and a scan line. */
export const Mark = ({ size = 28 }: I) => (
  <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
    <path d="M7 3h13l6 6v20H7z" fill="var(--surface)" stroke="var(--ink)" strokeWidth="2" strokeLinejoin="round" />
    <path d="M20 3v6h6" fill="none" stroke="var(--ink)" strokeWidth="2" strokeLinejoin="round" />
    <path d="M4 17h24" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" />
    <path d="M11 22h8M11 25.5h5" stroke="var(--ink)" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);
