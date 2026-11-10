import { createRoot } from "react-dom/client";
import { App } from "./App";
import { UpdateProvider } from "./screens/Update";
// The fonts ship inside the app, so it looks the same with no internet and
// nothing is fetched from another site when it opens.
import "@fontsource-variable/bricolage-grotesque/wght.css";
import "@fontsource/ibm-plex-sans-arabic/400.css";
import "@fontsource/ibm-plex-sans-arabic/500.css";
import "@fontsource/ibm-plex-sans-arabic/600.css";
import "@fontsource/ibm-plex-sans-arabic/700.css";
import "@fontsource/ibm-plex-mono/500.css";
import "./styles.css";
import "./theme.css";

createRoot(document.getElementById("root")!).render(<UpdateProvider><App /></UpdateProvider>);
