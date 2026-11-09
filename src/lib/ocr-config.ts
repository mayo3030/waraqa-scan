// Choices for the on-device text reader. Kept free of Tesseract so tests can
// lock the Android workarounds without starting a worker.

export interface TesseractClientOptions {
  /** Path under the site root. The caller turns it into an absolute URL. */
  corePath: string;
  gzip: boolean;
  /**
   * "none" reads the bundled language files and does not touch IndexedDB.
   * Omitted on the web, which keeps Tesseract's normal cache.
   */
  cacheMethod?: "none";
}

export function tesseractOptions(native: boolean): TesseractClientOptions {
  if (native) {
    return {
      // The Android package step unpacks *.traineddata.gz and drops the
      // extension, so the file in the APK is eng.traineddata (same bytes).
      gzip: false,
      // The reader runs in a worker. IndexedDB inside that worker never
      // comes back on some Android WebViews, and the read then waits forever
      // before it even opens the bundled language file.
      cacheMethod: "none",
      // The SIMD WebAssembly build hangs while starting on some phones.
      // This file is the same engine without SIMD, and it is already in the APK.
      corePath: "vendor/tesseract/core/tesseract-core-lstm.wasm.js",
    };
  }
  return { gzip: true, corePath: "vendor/tesseract/core" };
}
