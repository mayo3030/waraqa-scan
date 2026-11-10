import * as I from "../icons";
import type { Toast } from "../App";
import { asLink } from "../lib/qr";
import { Capacitor } from "@capacitor/core";
import { Share } from "@capacitor/share";

interface Props { text: string; notify(t: Toast): void; onAgain(): void; onClose(): void }

/** What a scanned QR code says, with copy, open and share. */
export function CodeResult({ text, notify, onAgain, onClose }: Props) {
  const link = asLink(text);
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); notify({ text: "Copied" }); }
    catch { notify({ text: "Copying is not available here", tone: "error" }); }
  };
  const share = async () => {
    try {
      if (Capacitor.isNativePlatform()) {
        await Share.share({ text });
      } else await navigator.share({ text });
    } catch { /* cancelled */ }
  };
  return (
    <div className="scrim" onClick={onAgain}>
      <div className="sheet-panel" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>{link ? "Link in the code" : "Text in the code"}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><I.Close /></button>
        </div>
        <p className="code-text" dir="auto">{text}</p>
        {link && <p className="muted small">Check the address before you open it. Codes can point anywhere.</p>}
        <div className={link ? "row-3" : "row-2"}>
          <button className="btn btn-quiet" onClick={copy}><I.Copy /> Copy</button>
          {link && <button className="btn btn-quiet" onClick={() => window.open(link, "_blank", "noopener")}>Open</button>}
          <button className="btn btn-quiet" onClick={share}><I.Share /> Share</button>
        </div>
        <button className="btn btn-primary wide" onClick={onAgain}><I.Qr /> Scan another</button>
      </div>
    </div>
  );
}
