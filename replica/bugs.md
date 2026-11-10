# Bugs: Waraqa Scan

Found in the QA pass of 2026-11-09 on the build after v1.2.14. Browser: Chrome, 390 x 844, dark and light.
Only bugs that were reproduced are listed. Each fixed one has a test that fails without the fix.

Summary: 13 found, 13 fixed. Open: S1 0, S2 0, S3 0, S4 0.
BUG-008 to BUG-010 were found by Mina on his phone in v1.2.18-test; the first QA pass missed them because it had no test for the system bars and no hand-held photos. Both gaps now have tests.

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

### BUG-008: Screens run under the status bar and the navigation bar

- Severity: S2
- Flow / case: SAFE-1 to SAFE-4
- Screen: every screen
- Build: v1.2.18-test  Device: Mina's Android phone, three-button navigation

Steps
1. Open any screen, for example Adjust corners.

Expected: the title sits below the clock, and the bottom buttons sit above the phone's own Back, Home and Recents buttons.
Actual: the title is drawn under the clock and the status icons; Auto, Whole photo and Next are drawn under the phone's buttons.
Evidence: Mina's screenshot of Adjust corners, 2026-11-10.
Suspected cause: Android draws the app edge to edge. The top bar and the bottom docks left no room for the bars, and the WebView does not always report the bars through env(). 
Status: fixed. The app column is padded by the bar sizes Capacitor reports, and full-screen layers (camera, sheets) add the room themselves. e2e/safe-area.spec.ts checks every screen with a 36px status bar and a 48px navigation bar.

### BUG-009: Adjust corners draws the photo wider than the screen

- Severity: S2
- Flow / case: F01-H1
- Screen: Adjust corners
- Build: v1.2.18-test and earlier

Steps
1. Scan or import an upright photo.

Expected: the whole photo shows, with all four corners in reach.
Actual: the photo starts at the left margin and runs off the right edge; a corner on the right can be off the screen and cannot be dragged.
Evidence: Mina's screenshot (the top right corner is not on the screen).
Suspected cause: the fit used the stage size including its padding.
Status: fixed. The test checks that all four corners are on the screen with room for a finger.

### BUG-010: Page detection is pulled out by fingers

- Severity: S2
- Flow / case: F01-E6 (a card held in a hand)
- Screen: Adjust corners
- Build: v1.2.18-test and earlier

Steps
1. Hold an ID card in one hand, thumb over an edge, and scan it.

Expected: the four corners land on the card.
Actual: a corner is dragged out to the thumb or to the edge of the photo.
Evidence: tests/fixtures/photo-hand-1.jpg: the old detector was 335 px off; photo-hand-3.jpg 38 px.
Suspected cause: the outline of card plus fingers was taken as the page.
Status: fixed. Each side is now moved onto the longest straight edge near it, looking further in when a side has nothing straight under it. All seven test photos are within 9 px (hand-1: 5 px).

### BUG-011: Buttons stay highlighted after a tap

- Severity: S3
- Screen: bottom bars
- Build: v1.2.18-test and earlier

Expected: a button shows a press, then returns to normal.
Actual: Auto kept a grey box behind it (the phone keeps "hover" on the last thing tapped).
Evidence: Mina's screenshot.
Status: fixed. Hover styles apply only where there is a mouse; taps get their own short press state.

### BUG-012: A tall page is cut off in Clean up

- Severity: S3
- Flow / case: F01-E7
- Screen: Clean up
- Build: v1.2.18-test and earlier

Steps
1. Scan an upright card or a receipt and go to Clean up.

Expected: the whole page shows above the filters.
Actual: the bottom of the page is hidden behind the filters.
Status: fixed, with a test.

### BUG-013: Long sheets scroll under the navigation bar

- Severity: S3
- Flow / case: SAFE-3
- Screen: All features, long sheets
- Build: found by the new system-bar test before release

Expected: the list ends above the phone's buttons.
Actual: rows of All features showed through under them.
Status: fixed.

## To check on a phone

Not reproduced here because they need a real device. They are the manual list in the plan.

- The system bars on the phone itself: the test uses a 36px and a 48px bar; a phone with a different bar or gesture navigation should look the same.
- Page detection on real photos. The test photos are drawn, not taken; real ones that fail should be added to tests/fixtures.
- The real camera: focus, flash, HD, the spirit level, auto capture in Book.
- Share sheet, print, saving the backup file to Drive.
- Update download and Android's install screen; installing over an older build signed with another key.
- Arabic text reading on real paper, and Arabic search inside an exported PDF in the phone's PDF viewer.
- 50 pages in one document on a phone with little memory.
