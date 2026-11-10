# Bugs: Waraqa Scan

Found in the QA pass of 2026-11-09 on the build after v1.2.14. Browser: Chrome, 390 x 844, dark and light.
Only bugs that were reproduced are listed. Each fixed one has a test that fails without the fix.

Summary: 7 found, 7 fixed. Open: S1 0, S2 0, S3 0, S4 0.

### BUG-001: The floating scan button covers Delete while selecting documents

- Severity: S2
- Flow / case: F07-H4 (delete several documents)
- Screen: All Documents, selection mode
- Build: v1.2.14  Browser / device: Chrome, 390px

Steps
1. Open All Documents and tap Select.
2. Tick two documents.
3. Tap Delete in the bar at the bottom.

Expected: the "Delete 2 documents?" question opens.
Actual: the tap lands on the floating scan button and the camera opens. There is no other way to delete several documents.
Evidence: e2e/organize.spec.ts "folders, tags, merge and deleting several documents" failed with "fab ... intercepts pointer events".
Suspected cause: the button was added in the 1.2.14 layout pass and drawn above every screen state.
Status: fixed. The button is not shown while selecting.

### BUG-002: A tap on the shutter right after the camera opens does nothing

- Severity: S3
- Flow / case: F01-E5
- Screen: Camera
- Build: v1.2.14

Steps
1. Open the camera.
2. Tap the shutter at once, before the picture has appeared.

Expected: the photo is taken, or the app says the camera is still starting.
Actual: nothing happens and nothing is said.
Evidence: e2e/camera.spec.ts "take a photo with the camera and save it as a page" timed out waiting for the corners screen.
Status: fixed. The tap waits for the first frame (up to 2.5 s), then takes the photo or says "The camera is still starting."

### BUG-003: The page sheet is wider than the screen

- Severity: S3
- Flow / case: F02-H2
- Screen: Document, page sheet
- Build: v1.2.14

Steps
1. Open a document and tap a page.

Expected: the page preview and its buttons fit the sheet.
Actual: the preview runs off the right edge; the Close button and the Restore button are cut off.
Evidence: screenshot of the sheet at 390px before the fix.
Status: fixed. The preview is held to the sheet width and the buttons wrap.

### BUG-004: The update button is too easy to miss

- Severity: S3
- Flow / case: F10-H1
- Screen: Home, Me
- Build: v1.2.14

Steps
1. Install a version older than the newest release and open the app.

Expected: the app makes it obvious that a newer version is out.
Actual: the only sign is a small dot on two arrows in the corner. Reported by Mina: "I can't see the button of update."
Status: fixed. A sheet opens once per new version, a strip stays on Home, and Me has a full-width button. Covered by e2e/update.spec.ts (4 cases).

### BUG-005: The fonts came from the internet

- Severity: S3
- Flow / case: F09-E3 (no internet)
- Screen: all
- Build: v1.2.14

Steps
1. Turn off the internet and open the app.

Expected: the app looks the same, and asks no other site for anything.
Actual: the fonts were requested from fonts.googleapis.com on every start; offline the app fell back to the phone's own fonts. Every test run logged a failed request.
Status: fixed. The three font families ship inside the app.

### BUG-006: Extract pages reads its buttons as "Page 1 1"

- Severity: S4
- Flow / case: F06-H6
- Screen: Document, Extract pages
- Build: v1.2.14

Expected: a screen reader says "Page 1".
Actual: it says "Page 1 1" (the picture's label and the number together).
Status: fixed.

### BUG-007: Full-width buttons on Me are squeezed to a strip

- Severity: S4
- Flow / case: F10-H3
- Screen: Me
- Build: the update button change, before release

Expected: the button is 50px tall like every other.
Actual: when the page is longer than the screen, the button shrinks to about 20px.
Status: fixed before release.

## To check on a phone

Not reproduced here because they need a real device. They are the manual list in the plan.

- The real camera: focus, flash, HD, the spirit level, auto capture in Book.
- Share sheet, print, saving the backup file to Drive.
- Update download and Android's install screen; installing over an older build signed with another key.
- Arabic text reading on real paper, and Arabic search inside an exported PDF in the phone's PDF viewer.
- 50 pages in one document on a phone with little memory.
