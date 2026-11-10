# Waraqa Scan

A phone-first document scanner that runs in the browser. Take a photo of a page,
it finds the page edges, flattens it, cleans it up, and saves multi-page
documents as PDF or JPG. It can also read the text (English and Arabic).
Everything stays on the device (IndexedDB). There is no server.

## Features (v1)

- **Scan or import**: phone camera (`capture="environment"`) or several photos from the gallery at once.
- **Automatic page edges** with OpenCV.js (Canny + contours), with draggable corners and a magnifier for precise placement.
- **Perspective correction** (own homography + bilinear warp in `src/lib/geometry.ts`).
- **Filters**: Clean (removes uneven lighting, keeps color), Original, Grayscale, B&W (adaptive threshold), plus brightness and contrast. Rotate in 90° steps.
- **Multi-page documents**: reorder, re-edit corners/filter, delete pages; rename and delete documents.
- **Export**: PDF (Letter, A4 or same-as-page) and JPG per page. Share sheet where the browser supports file sharing.
- **Text extraction (OCR)** with Tesseract.js, English, Arabic or both. VIN-aware cleanup fixes O/0 and I/1 mix-ups inside 17-character VINs.
- **Search** across document names and extracted text.

## Features added in 1.1

- **Tabs**: Home (quick actions, recent documents with Share / To Word / View), Documents, Tools, Me.
- **Live camera** with flash, HD, grid lines, help per mode, single or batch shots, and modes:
  Scan, Extract Text, To Word, To Excel, ID Cards (front and back on one page at real card size),
  Receipt, Book (splits two pages at the spine), Whiteboard, Slides, Mega Scan (joins overlapping shots
  of a long page), ID Photo (2x2 in, 35x45, 25x35, 33x48, 35x49 mm plus a 4x6 print sheet),
  Timestamp (date, time and optional coordinates on the photo), Scan Code (QR).
  Falls back to the phone's own camera app when the live camera is not available.
- **Documents**: folders, tags, sort (last changed, date made, name), grid or list,
  select several to move, tag, merge or delete.
- **Import Files**: PDFs (each page becomes an image page) and images, kept as they are.
- **Convert**: Word (.docx, text plus page images), Excel (.xlsx, rows and columns guessed from the text),
  PowerPoint (.pptx), all pages as JPGs, one long image, PDF file to images or to a long image.
- **Edit**: sign (drawn signatures kept on the phone), watermark, smart erase (paint over, filled from the
  surroundings), erase colored pen marks, restore old photos, merge, extract pages, reorder,
  PDF password, smaller PDF.
- **Print** through Android's print dialog.

Not included because they need an online service: photo translation, formula solving, AI chat, cloud sync.

## AI features (your own keys)

Me > AI keys has two fields: an OpenRouter API key and a Replicate API token. The app stores them encrypted on the phone (AES-GCM with a key held by the Android Keystore). They are never part of the source, the build or the APK, and the screen only ever shows the last 4 characters.

- **Formula to LaTeX** and **AI Chat** (ask about a document) call OpenRouter with `anthropic/claude-haiku-5.5`.
- **AI Restore** (CodeFormer) and **AI Colorize** (DDColor) call Replicate. The app reads each model's newest version and inputs from Replicate before the call.
- Without a key the feature says where to add it. Each use sends the chosen page to that service and spends your credit there.

## Features added in 1.2

- **All features** button on the camera: every mode, grouped (scan, convert, doc tools, enhance, screens, more).
- **ID Cards** presets: General, Driver License, ID Card, Passport (one page, 125 x 88 mm), Bank Card. Real size on one A4 or Letter page, optional "For ___ use only" watermark.
- **Formula**: capture, crop to the formulas, save to Word as a picture plus read text. Editable equations need an online service and are not made.
- **Translate**: language picker (auto detect to a target). Reads the text on the phone, translates on the phone where the WebView has a built-in translator, otherwise opens Google Translate with the text when tapped (that goes online).
- **Incorrect Question**: reads a test, splits it into numbered questions (English and Arabic numbering), you tick the wrong ones, saves a Word review sheet.
- **Restore Photo** mode with Restore (dust, fading) and Colorize (warm tones on black and white). Both are simple on-phone versions, not AI.
- **Book** auto capture: takes the next spread after the page turns and the picture holds still.
- **Smart Erase** as a camera mode, **CountCam** (count objects on a plain background, fix by tapping), **Greeting Card** (four designs of our own, your text).
- **Scan Code**: barcodes as well as QR, a history of the last 50, flashlight.
- **Camera settings**: orientation lock (auto, portrait, landscape), grid, shutter sound, spirit level, HD, location.
- **Scan settings**: auto adjust borders, adjust after each scan (off saves straight away), start with camera, use system camera, import button, save photos to Pictures/Waraqa (Android 10+), double-focus.

## Run it

```
npm install          # also copies OpenCV / Tesseract runtime files into public/vendor
npm run dev          # open the printed URL; use your phone on the same Wi-Fi with --host
npm run build        # production build in dist/
```

The camera only opens on `https://` or `localhost`, so test on a phone through an HTTPS host
(for example a Vercel or Netlify deploy of `dist/`).

`npm run build:demo` builds a single-file page (app code inlined) in `dist-demo/`; the big runtime
files stay in `dist-demo/vendor/`. That is what the Claude demo page uses.

## Android app (.apk) and updates

The `android/` folder is a Capacitor 8 wrapper around the same web app (app id `com.mina.waraqa`).

- **Automatic builds:** every push to `main` runs `.github/workflows/android.yml` on GitHub.
  It builds a signed `.apk` and publishes it as a GitHub Release named `v1.0.<build number>`.
  Download the newest `.apk` from the repo's **Releases** page.
- **Update button:** the circular-arrows button at the top of the app's home screen reads the
  newest release, downloads its `.apk` and asks Android to install it. Your scans stay on the phone.
  The first time, Android asks you to allow installs from Waraqa Scan.
- **Signing:** every build uses the same key so updates install over the old version.
  By default that is `android/app/waraqa-debug.keystore` (a debug-grade key kept in the repo).
  For your own private key, add the repo secrets `WARAQA_KEYSTORE_BASE64`, `WARAQA_KEYSTORE_PASSWORD`,
  `WARAQA_KEY_ALIAS` and `WARAQA_KEY_PASSWORD`. Switching keys means uninstalling once.
- **Private source repo:** the update button needs releases anyone can download. If this repo is
  private, make a public repo for the builds only, then set the repository variable `RELEASES_REPO`
  (owner/name) and a `RELEASES_TOKEN` secret that can create releases there.
- **Google Drive copy (optional):** add the secret `RCLONE_CONF` holding an rclone config with a
  Google Drive remote named `gdrive`. Each build then also lands in Drive in the folder
  "Waraqa Scan Updates" (change it with the repository variable `DRIVE_FOLDER`), as
  `waraqa-scan-<version>.apk` plus `waraqa-scan-latest.apk`.
- **Build on your computer:** `npm run apk` (needs Android Studio / the Android SDK and JDK 21).

## Tests

```
npm run fixtures     # makes 3 photographed-document test images (needs Python + Pillow + NumPy)
npm test             # VIN fixes, edge detection/flattening/filters on the 3 photos, image tools, Word/Excel export
npm run test:ocr     # reads the cleaned test page (English) and an Arabic sample with Tesseract
```

Current results: page corners found on all 3 photos (largest corner error 8 px on 1500–2000 px photos),
all key fields of the test bill of sale read correctly, Arabic sample words read.

## Layout

```
src/App.tsx              screen flow (home -> corners -> clean up -> document)
src/screens/             Home, Documents, Tools, Settings, Camera, Crop, Filter, DocView, Sign, Erase, IdPhoto
src/lib/geometry.ts      corner ordering, homography, warp, rotation
src/lib/detect.ts        page edge detection (OpenCV.js)
src/lib/filters.ts       Clean / Grayscale / B&W filters, brightness, contrast
src/lib/store.ts         IndexedDB documents and pages
src/lib/pdf.ts           PDF export (jsPDF)
src/lib/ocr.ts           Tesseract.js text reading (+ Claude fallback inside the Claude page viewer)
src/lib/vin.ts           VIN OCR clean-up
src/lib/imaging.ts       ID card sheet, ID photo, book split, mega scan stitch, long image, clean-up tools
src/lib/modes.ts         camera modes and what happens after saving
src/lib/exporters.ts     Word, Excel, PowerPoint, long image
tools/                   test image generator, vendor copy, demo page builder
```

## Next steps

- Wrap as an Android app with Capacitor (native camera, file sharing, Play Store).
- Live camera viewfinder with real-time edge outline and auto-capture.
- Live edge outline and auto-capture on the camera.
- Better table detection for Excel (cell borders, not only spacing).
