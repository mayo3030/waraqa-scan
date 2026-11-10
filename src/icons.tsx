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

export const Close = ({ size = 20 }: I) => svg(size, <g {...P}><path d="M6 6l12 12M18 6 6 18" /></g>);
export const Flash = ({ size = 20 }: I) => svg(size, <g {...P}><path d="M13 3 6 13h5l-1 8 7-10h-5z" /></g>);
export const FlashOff = ({ size = 20 }: I) => svg(size, <g {...P}><path d="M13 3 9.6 7.9M8.2 10 6 13h5l-1 8 3.4-4.9M15 14l2-3h-5l1-8M4 4l16 16" /></g>);
export const Help = ({ size = 20 }: I) => svg(size, <g {...P}><circle cx="12" cy="12" r="8.5" /><path d="M9.7 9.5a2.4 2.4 0 1 1 3.3 2.2c-.6.3-1 .8-1 1.5v.6" /><path d="M12 16.8v.2" /></g>);
export const Dots = ({ size = 20 }: I) => svg(size, <g {...P}><path d="M12 5.5v.1M12 12v.1M12 18.5v.1" strokeWidth="3" /></g>);
export const Grid = ({ size = 20 }: I) => svg(size, <g {...P}><rect x="4" y="4" width="16" height="16" rx="1" /><path d="M9.3 4v16M14.7 4v16M4 9.3h16M4 14.7h16" /></g>);
export const List = ({ size = 20 }: I) => svg(size, <g {...P}><path d="M9 6.5h11M9 12h11M9 17.5h11M4.5 6.5h.1M4.5 12h.1M4.5 17.5h.1" /></g>);
export const Tiles = ({ size = 20 }: I) => svg(size, <g {...P}><rect x="4" y="4" width="6.5" height="6.5" rx="1" /><rect x="13.5" y="4" width="6.5" height="6.5" rx="1" /><rect x="4" y="13.5" width="6.5" height="6.5" rx="1" /><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1" /></g>);
export const Folder = ({ size = 20 }: I) => svg(size, <g {...P}><path d="M3.5 6.5h6l2 2h9v10h-17z" /></g>);
export const Tag = ({ size = 20 }: I) => svg(size, <g {...P}><path d="M4 4h7l9 9-7 7-9-9z" /><circle cx="8.5" cy="8.5" r="1.2" /></g>);
export const Check = ({ size = 20 }: I) => svg(size, <g {...P}><path d="m5 12.5 4.5 4.5L19 7.5" /></g>);
export const Sign = ({ size = 20 }: I) => svg(size, <g {...P}><path d="M3.5 17c2.5-6 4.5-9 5.5-8s-2 7 0 7 3-4 4.5-4 0 3 1.5 3 2-1.5 3-1.5" /><path d="M3.5 20.5h17" /></g>);
export const Eraser = ({ size = 20 }: I) => svg(size, <g {...P}><path d="m8.5 19.5-4-4 10-10 6 6-8 8zM8.5 19.5h11M8 11.5l6 6" /></g>);
export const Wand = ({ size = 20 }: I) => svg(size, <g {...P}><path d="m4 20 11-11M13 7l4 4" /><path d="M17.5 3v3M16 4.5h3M20.5 9v2M19.5 10h2M8 3.5v2M7 4.5h2" /></g>);
export const Lock = ({ size = 20 }: I) => svg(size, <g {...P}><rect x="5" y="10.5" width="14" height="10" rx="1.5" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /></g>);
export const Print = ({ size = 20 }: I) => svg(size, <g {...P}><path d="M7 8V3.5h10V8M7 17H4.5V8h15v9H17" /><rect x="7" y="13.5" width="10" height="7" /></g>);
export const Word = ({ size = 20 }: I) => svg(size, <g {...P}><path d="M6 3.5h8l4 4v13H6z" /><path d="m8.5 11 1.3 6 2.2-4.5 2.2 4.5 1.3-6" /></g>);
export const Excel = ({ size = 20 }: I) => svg(size, <g {...P}><path d="M6 3.5h8l4 4v13H6z" /><path d="M8.5 11h7v6.5h-7zM8.5 14.2h7M12 11v6.5" /></g>);
export const Ppt = ({ size = 20 }: I) => svg(size, <g {...P}><rect x="3.5" y="5" width="17" height="11" rx="1" /><path d="M12 16v4M8.5 20h7M9.5 13V8h2.3a1.7 1.7 0 0 1 0 3.4H9.5" /></g>);
export const Merge = ({ size = 20 }: I) => svg(size, <g {...P}><path d="M6 4v5c0 3 6 3 6 6v5M18 4v5c0 3-6 3-6 6" /><path d="m9 17 3 3 3-3" /></g>);
export const Cut = ({ size = 20 }: I) => svg(size, <g {...P}><path d="M6 3.5h8l4 4v13H6z" /><path d="M9 14h6M12 11v6" /></g>);
export const Home = ({ size = 22 }: I) => svg(size, <g {...P}><path d="M4 11 12 4.5l8 6.5v9h-5.5v-6h-5v6H4z" /></g>);
export const Docs = ({ size = 22 }: I) => svg(size, <g {...P}><path d="M8 3.5h7l4 4V17H8z" /><path d="M15 3.5v4h4M5 7v13.5h11" /></g>);
export const Tools = ({ size = 22 }: I) => svg(size, <g {...P}><rect x="4" y="4" width="6.5" height="6.5" rx="1.5" /><rect x="13.5" y="4" width="6.5" height="6.5" rx="3.25" /><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" /><path d="M16.75 13.5v6.5M13.5 16.75H20" /></g>);
export const Me = ({ size = 22 }: I) => svg(size, <g {...P}><circle cx="12" cy="8.5" r="3.8" /><path d="M4.5 20c1-3.8 4-5.5 7.5-5.5s6.5 1.7 7.5 5.5" /></g>);
export const Qr = ({ size = 20 }: I) => svg(size, <g {...P}><rect x="4" y="4" width="6" height="6" /><rect x="14" y="4" width="6" height="6" /><rect x="4" y="14" width="6" height="6" /><path d="M14 14h2.5v2.5H14zM17.5 17.5H20V20h-2.5zM20 14v1M14 20h1" /></g>);
export const IdCard = ({ size = 20 }: I) => svg(size, <g {...P}><rect x="3" y="5.5" width="18" height="13" rx="1.5" /><circle cx="8.5" cy="11" r="2" /><path d="M5.5 16c.6-1.5 1.7-2.2 3-2.2s2.4.7 3 2.2M14 10h4.5M14 13.5h3" /></g>);
export const Book = ({ size = 20 }: I) => svg(size, <g {...P}><path d="M12 6.5C10 5 7 4.5 3.5 5v13c3.5-.5 6.5 0 8.5 1.5 2-1.5 5-2 8.5-1.5V5C17 4.5 14 5 12 6.5zM12 6.5v13" /></g>);
export const Receipt = ({ size = 20 }: I) => svg(size, <g {...P}><path d="M6 3.5h12v17l-2-1.3-2 1.3-2-1.3-2 1.3-2-1.3-2 1.3z" /><path d="M9 8h6M9 11.5h6M9 15h3.5" /></g>);
export const Board = ({ size = 20 }: I) => svg(size, <g {...P}><rect x="3" y="4.5" width="18" height="12" rx="1" /><path d="M8 20l2-3.5M16 20l-2-3.5M7 9.5c1.5-1.5 3-1.5 4 0s2.5 1.5 4 0" /></g>);
export const Long = ({ size = 20 }: I) => svg(size, <g {...P}><rect x="7" y="2.5" width="10" height="19" rx="1" /><path d="M7 9h10M7 15h10" /></g>);
export const Stamp = ({ size = 20 }: I) => svg(size, <g {...P}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></g>);
export const Person = ({ size = 20 }: I) => svg(size, <g {...P}><rect x="4.5" y="3" width="15" height="18" rx="1.5" /><circle cx="12" cy="10" r="3" /><path d="M7.5 18c.7-2.4 2.4-3.6 4.5-3.6s3.8 1.2 4.5 3.6" /></g>);
export const Compress = ({ size = 20 }: I) => svg(size, <g {...P}><path d="M6 3.5h8l4 4v13H6z" /><path d="M12 9v3M10 10.5l2 2 2-2M12 18v-3M10 16.5l2-2 2 2" /></g>);
export const Drop = ({ size = 20 }: I) => svg(size, <g {...P}><path d="M5 19 19 5" /><path d="M4 9.5h4M9.5 4v4M16 14.5h4M14.5 16v4" /></g>);
export const Mega = ({ size = 20 }: I) => svg(size, <g {...P}><rect x="6" y="2.5" width="12" height="7" rx="1" /><rect x="6" y="8.5" width="12" height="7" rx="1" strokeDasharray="2 2" /><rect x="6" y="14.5" width="12" height="7" rx="1" /></g>);
export const Upload = ({ size = 20 }: I) => svg(size, <g {...P}><path d="M6 3.5h8l4 4v13H6z" /><path d="M12 17v-6.5M9.5 13l2.5-2.5 2.5 2.5" /></g>);
export const Restore = ({ size = 20 }: I) => svg(size, <g {...P}><rect x="3.5" y="5" width="17" height="14" rx="1.5" /><path d="m6.5 16 4-4 3 3 2-2 2 2" /><path d="M16 7.5v3M14.5 9h3" /></g>);
export const Translate = ({ size = 20 }: I) => svg(size, <g {...P}><path d="M3.5 6h9M8 4v2M10.5 6c-.6 3.5-3 6.3-6 7.5M6 9.5c1 1.7 2.6 3 4.5 3.7" /><path d="m12.5 20 3.8-9 3.7 9M13.8 17h5" /></g>);
export const Question = ({ size = 20 }: I) => svg(size, <g {...P}><path d="M6 3.5h9l3.5 3.5v13.5H6z" /><path d="M9 9.5h6M9 13h3" /><path d="m12.5 17 1.6 1.6 3-3.2" /></g>);
export const Formula = ({ size = 20 }: I) => svg(size, <g {...P}><rect x="4" y="3.5" width="16" height="17" rx="1.5" /><path d="M7 13l1.5-1 1.5 4.5 2.5-8.5h5M13.5 12.5l3 3.5M16.5 12.5l-3 3.5" /></g>);
export const Count = ({ size = 20 }: I) => svg(size, <g {...P}><circle cx="12" cy="7.5" r="3.5" /><circle cx="7.5" cy="15.5" r="3.5" /><circle cx="16.5" cy="15.5" r="3.5" /><path d="M11.5 6.3 12.3 5.8v3.6M6.6 14.3c.4-.6 1.8-.6 1.8.3 0 .8-1.8 1.4-1.8 2.3h1.9M15.7 14.2h1.6l-.9 1.2c.9 0 1.2.4 1.2.9s-.5.9-1.1.9-.9-.2-1-.5" strokeWidth="1.3" /></g>);
export const Card = ({ size = 20 }: I) => svg(size, <g {...P}><rect x="5" y="3.5" width="14" height="17" rx="1.5" /><path d="M12 13.2c-2.3-1.4-3.4-2.6-3.4-3.9a1.7 1.7 0 0 1 3.4-.4 1.7 1.7 0 0 1 3.4.4c0 1.3-1.1 2.5-3.4 3.9zM8.5 16.5h7" /></g>);
export const History = ({ size = 20 }: I) => svg(size, <g {...P}><path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" /><path d="M4.5 4.5v3.5H8M12 8v4.3l2.8 1.7" /></g>);
export const Gear = ({ size = 20 }: I) => svg(size, <g {...P}><circle cx="12" cy="12" r="3" /><path d="M12 3.5v2.3M12 18.2v2.3M3.5 12h2.3M18.2 12h2.3M6 6l1.6 1.6M16.4 16.4 18 18M6 18l1.6-1.6M16.4 7.6 18 6" /></g>);
export const Apps = ({ size = 20 }: I) => svg(size, <g {...P}><circle cx="6.5" cy="6.5" r="2.2" /><circle cx="17.5" cy="6.5" r="2.2" /><circle cx="6.5" cy="17.5" r="2.2" /><circle cx="17.5" cy="17.5" r="2.2" /></g>);
export const Level = ({ size = 20 }: I) => svg(size, <g {...P}><rect x="3" y="8.5" width="18" height="7" rx="3.5" /><circle cx="12" cy="12" r="1.8" /><path d="M9 8.5v7M15 8.5v7" /></g>);
export const Sparkle = ({ size = 20 }: I) => svg(size, <g {...P}><path d="M11 3.5c.6 3.9 2.6 5.9 6.5 6.5-3.9.6-5.9 2.6-6.5 6.5-.6-3.9-2.6-5.9-6.5-6.5 3.9-.6 5.9-2.6 6.5-6.5zM18 14.5c.3 1.8 1.2 2.7 3 3-1.8.3-2.7 1.2-3 3-.3-1.8-1.2-2.7-3-3 1.8-.3 2.7-1.2 3-3z" /></g>);
export const Sort = ({ size = 20 }: I) => svg(size, <g {...P}><path d="M7 4v16M4 7l3-3 3 3M17 20V4M14 17l3 3 3-3" /></g>);

/** The Waraqa mark: a page with a folded corner and a scan line. */
export const Mark = ({ size = 28 }: I) => (
  <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
    <path d="M7 3h13l6 6v20H7z" fill="var(--surface)" stroke="var(--ink)" strokeWidth="2" strokeLinejoin="round" />
    <path d="M20 3v6h6" fill="none" stroke="var(--ink)" strokeWidth="2" strokeLinejoin="round" />
    <path d="M4 17h24" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" />
    <path d="M11 22h8M11 25.5h5" stroke="var(--ink)" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);
export const Hd = ({ size = 20 }: I) => svg(size, <g {...P}><rect x="3" y="5.5" width="18" height="13" rx="2.5" /><path d="M7 9.5v5M7 12h3.2M10.2 9.5v5M13.5 9.5v5h1.6a2.5 2.5 0 0 0 0-5z" /></g>);
export const Cutout = ({ size = 20 }: I) => svg(size, <g {...P}><path d="M4 7V5.5A1.5 1.5 0 0 1 5.5 4H7M17 4h1.5A1.5 1.5 0 0 1 20 5.5V7M20 17v1.5a1.5 1.5 0 0 1-1.5 1.5H17M7 20H5.5A1.5 1.5 0 0 1 4 18.5V17" /><circle cx="12" cy="10" r="3" /><path d="M7 18c.8-2.5 2.6-3.8 5-3.8s4.2 1.3 5 3.8" /></g>);
