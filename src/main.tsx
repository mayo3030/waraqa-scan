import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

// Loaded after the page is up. A stalled fonts.googleapis.com request used to
// sit in the document head and hold the first paint (and the Android splash)
// until the phone gave up, which looks like the app hanging on launch.
function loadBrandFonts() {
  if (document.getElementById("brand-fonts")) return;
  const link = document.createElement("link");
  link.id = "brand-fonts";
  link.rel = "stylesheet";
  link.href = "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700&family=IBM+Plex+Sans+Arabic:wght@400;500;600&family=IBM+Plex+Mono:wght@500&display=swap";
  document.head.appendChild(link);
}

createRoot(document.getElementById("root")!).render(<App />);
if (document.readyState === "complete") loadBrandFonts();
else window.addEventListener("load", loadBrandFonts, { once: true });
