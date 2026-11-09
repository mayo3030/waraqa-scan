import * as I from "../icons";

/**
 * "Scan" opens the phone camera; "Import" picks photos from the gallery.
 * Each button is a <label> around its file input, so the tap itself opens
 * the picker (more reliable in in-app browsers than input.click()).
 */
export function PhotoButtons({ onPhotos, compact }: { onPhotos(b: Blob[]): void; compact?: boolean }) {
  const take = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).filter((f) => f.type.startsWith("image/") || !f.type);
    e.target.value = "";
    if (files.length) onPhotos(files);
  };
  const sfx = compact ? "-doc" : "-home";
  return (
    <div className={"photo-buttons" + (compact ? " compact" : "")}>
      <label className="btn btn-quiet" htmlFor={"pick-gallery" + sfx}>
        <input id={"pick-gallery" + sfx} className="file-input" type="file" accept="image/*" multiple onChange={take} />
        <I.Images /> Import
      </label>
      <label className="btn btn-primary" htmlFor={"pick-camera" + sfx}>
        <input id={"pick-camera" + sfx} className="file-input" type="file" accept="image/*" capture="environment" onChange={take} />
        <I.Camera /> Scan
      </label>
    </div>
  );
}
