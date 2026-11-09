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
npm test             # VIN fixes + edge detection, flattening and filters on the 3 photos
npm run test:ocr     # reads the cleaned test page (English) and an Arabic sample with Tesseract
```

Current results: page corners found on all 3 photos (largest corner error 8 px on 1500–2000 px photos),
all key fields of the test bill of sale read correctly, Arabic sample words read.

## Layout

```
src/App.tsx              screen flow (home -> corners -> clean up -> document)
src/screens/             Home, Crop, Filter, DocView, PhotoButtons
src/lib/geometry.ts      corner ordering, homography, warp, rotation
src/lib/detect.ts        page edge detection (OpenCV.js)
src/lib/filters.ts       Clean / Grayscale / B&W filters, brightness, contrast
src/lib/store.ts         IndexedDB documents and pages
src/lib/pdf.ts           PDF export (jsPDF)
src/lib/ocr.ts           Tesseract.js text reading (+ Claude fallback inside the Claude page viewer)
src/lib/vin.ts           VIN OCR clean-up
tools/                   test image generator, vendor copy, demo page builder
```

## Next steps

- Wrap as an Android app with Capacitor (native camera, file sharing, Play Store).
- Live camera viewfinder with real-time edge outline and auto-capture.
- Signature and watermark tools, ID card mode (front and back on one page).
