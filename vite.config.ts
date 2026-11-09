import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

// SINGLE=1 inlines the app code into index.html (used for the Claude demo page).
// Big runtime files (OpenCV, Tesseract) always stay separate under /vendor.
export default defineConfig({
  base: "./",
  plugins: [react(), ...(process.env.SINGLE ? [viteSingleFile({ removeViteModuleLoader: true })] : [])],
  build: { target: "es2020", chunkSizeWarningLimit: 2000 },
});
