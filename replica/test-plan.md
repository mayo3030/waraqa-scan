# Test plan: Waraqa Scan

Build: the commit after v1.2.14  Date: 2026-11-09  Env: local build with the test camera, fresh storage for every test

Automatic cases run on every push, before the .apk is built: `npm test` (9 unit files) and `npx playwright test` (33 end-to-end tests, each failing on any console error).

| case | flow | type | steps | expected | auto | result |
| --- | --- | --- | --- | --- | --- | --- |
| F01-H1 | scan a page to PDF | happy | import a photo, corners found, Next, Save page, PDF, Save PDF | a one-page PDF named after the document | e2e scan | pass |
| F01-E1 | | edge: leave on the corners screen | Cancel | back on Home, nothing saved | e2e scan | pass |
| F01-N1 | | negative: the file is not a photo | pick a text file renamed .jpg | message, still on Home | e2e scan | pass |
| F01-E5 | | edge: shutter tapped before the first frame | open camera, tap at once | photo taken | e2e camera | pass (BUG-002) |
| F01-H2 | | happy: photo from the camera | Scan, Single, shutter, Whole photo, Next, Save page | a new document with one page | e2e camera | pass |
| F02-H1 | several pages | happy | import 3 photos, save each | 3 pages | e2e scan | pass |
| F02-H2 | | happy: page sheet | tap page 1, Later, JPG, Delete | order changes, a JPEG is saved, 2 pages left | e2e scan | pass (BUG-003) |
| F02-E1 | | edge: very long, Arabic and emoji name | rename, go back | name shown, page does not scroll sideways | e2e scan | pass |
| F03-H1 | import files | happy | Import Files with a PDF | "1 page imported", document named after the file | e2e camera | pass |
| F03-N1 | | negative: broken PDF | Import Files with a damaged file | message, still on Home | e2e camera | pass |
| F04-H1 | read text and search | happy | Text, Read text | text has the title, the car and the 17-character VIN | e2e text | pass |
| F04-H2 | | happy: search | type a word from the page on Home | the document is the one result | e2e text | pass |
| F04-N1 | | negative: no match | type a word that is nowhere | "No document matches" | e2e text | pass |
| F04-H3 | searchable PDF | happy | read text, Save PDF, search inside the file | the PDF's own text has "BILL OF SALE" | e2e text + unit pdftext | pass |
| F04-H4 | | happy: Arabic words in the PDF | unit: Arabic words written and read back | found after the usual folding | unit pdftext | pass |
| F05-H1 | convert | happy | Tools: To Word, To Excel, To PPT | three files that open as Office packages | e2e text | pass |
| F06-H1 | PDF options | happy: smaller file | switch on Smaller file | under 80% of the normal size | e2e pdf | pass |
| F06-H2 | | happy: watermark | type a watermark | the file differs | e2e pdf | pass |
| F06-H3 | | happy: password with Arabic letters | type a password | name ends "(locked)", file is encrypted | e2e pdf | pass |
| F06-H4 | | happy: images and long image | Tools: Images, Long Image | JPEG files | e2e pdf | pass |
| F06-H5 | edit tools | happy | Reorder, Lock, Compress, Watermark, Print, Tags & Folder, Translate | each opens its own sheet | e2e tools | pass |
| F06-H6 | | happy: extract pages | pick page 1, make new document | a new one-page document | e2e tools | pass (BUG-006) |
| F06-H7 | | happy: sign | draw, Save signature | the signature can be placed | e2e tools | pass |
| F06-H8 | | happy: erase marks, smart erase | run both | page updated; brush screen opens and closes | e2e tools | pass |
| F06-H9 | | happy: tool from the Tools tab | To Word | asks which document, then opens the tool | e2e tools | pass |
| F07-H1 | organise | happy: folder with Arabic and emoji | Create Folder | folder shown as a row | e2e organize | pass |
| F07-H2 | | happy: move, tag, filter | select two, Move; tag one; tap the tag | counts are 2, then 1 | e2e organize | pass |
| F07-H3 | | happy: merge | select two, Merge | one document with both pages, 2-page PDF | e2e organize | pass |
| F07-E1 | | edge: delete a folder with documents in it | Rename or delete, Delete folder | documents kept | e2e organize | pass |
| F07-H4 | | happy: delete several | select three, Delete, Keep them, Delete, Delete | asks first; then 3 gone | e2e organize | pass (BUG-001) |
| F07-H5 | | happy: sort and grid remembered | change both, reopen | still set | e2e organize | pass |
| F08-H1 | camera modes | happy | Single/Batch, Book explainer, All Features, Scan Code, Settings | each shows what it should | e2e camera | pass |
| F08-H2 | | happy: ID card | Driver License, front, back, corners twice | one page with both sides | e2e tools | pass |
| F08-H3 | | happy: CountCam, ID Photo, Greeting Card | take a photo in each | each opens its own screen | e2e tools | pass |
| F09-H1 | keeping data | happy | scan, close and reopen the app | documents and pages still there | e2e scan | pass |
| F10-H1 | update from inside the app | happy | open with a newer release out | sheet opens by itself, Download and install shows progress | e2e update | pass (BUG-004) |
| F10-H2 | | happy: Later | Later, reopen | no sheet again; Home strip, arrows and Me button all offer it | e2e update | pass |
| F10-H3 | | happy: up to date | Check for updates | "You have the newest version" | e2e update | pass |
| F10-N1 | | negative: no internet | Check for updates, then Try again | explains, then works | e2e update | pass |
| F12-H1 | backup and restore | happy | back up, wipe the app, restore | both documents back, pages open | e2e backup | pass |
| F12-E1 | | edge: restore onto the same data | restore twice | "0 documents restored, 2 already on this phone" | e2e backup | pass |
| F12-N1 | | negative: wrong or cut-short file | pick each | refused with a message, nothing changes | e2e backup + unit backup | pass |
| A11Y-1 | every tab | accessibility scan, dark and light | axe on Home, All Documents, Tools, Me | no serious or critical findings | e2e smoke | pass |
| RESP-1 | every tab | small phone, 320px wide | open each tab | nothing scrolls sideways | e2e smoke | pass |
| F08-M1 | real camera | manual | focus, flash, HD, level, auto capture | | manual | not run: needs a phone |
| F09-M1 | update over the old install | manual | install the new .apk over the old one | documents kept | manual | not run: needs a phone |
| F10-M1 | Android install screen | manual | Download and install on the phone | Android's installer opens | manual | not run: needs a phone |
| F06-M1 | share and print | manual | share a PDF to WhatsApp, print | | manual | not run: needs a phone |
| F04-M1 | Arabic reading on real paper | manual | scan a printed Arabic page | text is usable | manual | not run: needs a phone |
