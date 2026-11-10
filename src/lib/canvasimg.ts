// Loads a Blob into an <img> element (for canvas drawing on the UI thread).
export function decodeImageElement(b: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(b);
  return new Promise((res, rej) => {
    const el = new Image();
    el.onload = () => { URL.revokeObjectURL(url); res(el); };
    el.onerror = () => { URL.revokeObjectURL(url); rej(new Error("The image could not be opened")); };
    el.src = url;
  });
}
