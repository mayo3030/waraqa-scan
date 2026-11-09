// Loads OpenCV.js once, from the app's own files, only when first needed.
/* eslint-disable @typescript-eslint/no-explicit-any */
let loading: Promise<any> | null = null;

export function assetUrl(path: string) {
  return new URL(path, document.baseURI).href;
}

export function loadOpenCV(): Promise<any> {
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const done = async () => {
      let cv = (window as any).cv;
      try {
        if (cv instanceof Promise) cv = await cv;
        if (!cv?.Mat) {
          await new Promise<void>((res, rej) => {
            const t = setTimeout(() => rej(new Error("OpenCV took too long to start")), 30000);
            cv.onRuntimeInitialized = () => { clearTimeout(t); res(); };
          });
        }
        resolve(cv);
      } catch (e) {
        reject(e);
      }
    };
    if ((window as any).cv) return void done();
    const s = document.createElement("script");
    const t = setTimeout(() => reject(new Error("Could not load the page finder")), 30000);
    s.src = assetUrl("vendor/opencv.js");
    s.async = true;
    s.onload = () => { clearTimeout(t); void done(); };
    s.onerror = () => { clearTimeout(t); reject(new Error("Could not load the page finder")); };
    document.head.appendChild(s);
  });
  loading.catch(() => { loading = null; });
  return loading;
}
