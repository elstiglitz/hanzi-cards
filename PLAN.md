# Plan: Mandarin flashcard PWA

Status: all 8 steps are built and deployed (see CLAUDE.md for current status and next steps). This file is the original plan and is not kept up to date.

## Decisions already made
- PWA installed on iPhone via Add to Home Screen, fully offline.
- Plain HTML/CSS/JavaScript, **no Node, no build step**. Python (already installed) handles Mac-side scripts.
- Pre-generated audio, Xiaoxiao voice (edge-tts), made on the Mac.
- Words added on the phone go to an **inbox** (not studied) until synced on the Mac, where audio is generated.
- Ask before sending any data online (CLAUDE.md).

## 1. File layout
The site lives in `docs/` so it can be published as-is (GitHub Pages only serves the repo root or `docs/`; other hosts take any folder).

```
docs/                     <- everything the phone receives
  index.html  app.js  style.css
  sw.js                   service worker (offline + updates)
  manifest.webmanifest    install metadata
  icons/                  home-screen icons
  data/words.json         generated from Words.csv
  data/precache.json      generated list of files to cache + version hash
  audio/*.mp3 + manifest.json   (moved from ./audio)
Data/Formatted data/Words.csv   source of truth for vocabulary
tools/
  gen_audio.py            exists
  build_data.py           Words.csv -> docs/data/words.json + precache.json
  merge_inbox.py          inbox CSV from phone -> Words.csv (dedupe, review)
```
`Words.csv` stays the single source of truth. `words.json` is always regenerated, never edited by hand.

## 2. Data schema
Word (words.json): `{ id, zh, py, en, lesson, audio }`
- `lesson` = a free-text grouping label, generic by design. It is used for yearly courses matching certification levels (A1, A2, B1, B2...), but it could be anything. Empty = unassigned. It is not part of the `id`, so re-tagging a word never resets its progress.
- `id` = hash of `"zh|py"`, the same key as `audio/manifest.json`. Handles 子 `zǐ` vs `zi`.
- `audio` = file name, or `null` (6 radicals + 子 `zi`): no speaker button, no error.
- Radicals have empty `py`: show character and English only.

On-device data (localStorage, small JSON):
- `progress`: `{ [id]: { box, due, seen, lastResult } }`
- `inbox`: `[ { zh, py?, en?, addedAt } ]`

Lessons: `Words.csv` gains a 4th column, `Lesson` (Chinese, Pinyin, English, Lesson). Filtering is in v1: pick one or more lessons for a study session, plus "Unassigned". The existing 563 words have no lesson yet and start as Unassigned; tagging them is a one-time task for you (see open questions). Lesson values are matched exactly, so the app offers existing labels when you type to avoid "A1" vs "a1" drift.

## 3. Cards and spaced repetition
- Card front/back: character, pinyin, English, speaker button (if audio).
- Modes: (a) character -> meaning, (b) English -> character, (c) listen -> meaning. Pick per session.
- SRS: simple Leitner boxes. Know it = move up a box, miss = back to box 1. Intervals 1, 2, 4, 8, 16 days. A session = due cards first, then a few new ones (default 10 new/day, adjustable).
- **Hint button** (reveals pinyin before you answer):
  - character -> meaning: the hint toggles the pinyin on and off.
  - listen -> meaning: the hint shows the pinyin.
  - English -> character: no hint (pinyin would give away the answer).
  - Radicals have no pinyin, so they show no hint button.
  - Decided: using a hint counts against you in the spaced repetition. A hinted card moves back one box instead of up, so the schedule reflects what you really recalled.
- Audio plays only on tap (iOS blocks autoplay), except after you tap "reveal" in listen mode.

## 4. Adding words and the inbox
- **Add one word** and **bulk import** (paste or choose a file, same 3 columns as Words.csv) both go to the inbox.
- Only Chinese is required. Pinyin, English and Lesson are optional; pinyin and English are filled in on the Mac and reviewed by you. A word added without a lesson stays unassigned; the form and bulk import never fill one in. Bulk import accepts an optional 4th `Lesson` column.
- Duplicate check on entry: warn if the character already exists in the deck or inbox.
- Inbox screen: shows pending count, edit/delete a pending word.
- **Getting words to the Mac:** "Export inbox" button -> iOS share sheet (AirDrop or Files) with a CSV; fallback is copy to clipboard. Inbox is only cleared after you confirm the export worked.
- **Mac side (`merge_inbox.py`):** merge into Words.csv, flag duplicates, I propose pinyin and English for blanks and you review (as with Mots.csv), then generate audio (after asking you), rebuild data, publish. The phone picks up the update (section 6).

## 5. Offline design (service worker)
- On install, cache the app shell, `words.json` and all audio (~7 MB) listed in `precache.json`. Cache-first afterwards.
- Cache name carries a version hash. When any file changes, the new service worker installs in the background and the app shows "Update available - reload".
- **Known iOS gotcha:** Safari fails to play audio served from a service worker unless it answers HTTP Range requests. `sw.js` must handle Range, and this is tested on a real iPhone.
- Ask for persistent storage and show the inbox count prominently, since iOS can clear web storage in rare cases.

## 6. Hosting and install
Decided: **GitHub Pages from a public repo** (free; the free tier requires public).
- Consequence accepted by the user: the vocabulary, lesson tags and audio are publicly visible. Source course material stays private via `.gitignore`.
- The commit author (name and email on every commit) is visible on a public repo. The repo currently uses `stiglitz.projekt@gmail.com`; use GitHub's private `noreply` address instead if that matters.
- Nothing is pushed or published without the user's explicit go-ahead (CLAUDE.md). Account creation steps: github.com sign-up, confirm email, turn on two-factor, create the repo.
- Install: open the Pages URL in Safari, Share, Add to Home Screen. Update: push; the phone fetches it next time it is online.

## 7. Build order (commit after each step)
| # | Step | Check |
|---|------|-------|
| 1 | Restructure to `docs/`, write `build_data.py` | 563 words in words.json; 556 with audio; ids unique |
| 2 | Static card UI in a desktop browser | All 563 cards render; 7 no-audio cards have no speaker button |
| 3 | Audio playback and the 3 modes | Spot-check 20 words incl. 还, 玩儿, 妈妈 |
| 4 | Leitner SRS, hint penalty, lesson filter, progress saving | Reload keeps progress; due dates behave over simulated days; a hinted card moves back a box; filtering by lesson returns only that lesson |
| 5 | Add one word, bulk import, inbox, export | Duplicates caught; exported CSV opens correctly on Mac |
| 6 | Manifest, icons, service worker with Range support | Desktop offline mode: everything works incl. audio |
| 7 | Deploy over HTTPS, install on iPhone | Airplane mode on iPhone: study, audio, add a word |
| 8 | `merge_inbox.py` and update flow | Round trip: add on phone, export, merge, audio, see it on phone |

## 8. Decisions on former open questions
1. Hosting: GitHub Pages, public repo.
2. Export route: share sheet (AirDrop / Files), clipboard as fallback.
3. New cards per day: 10 (adjustable).
4. Lesson tagging of the existing 563 words: all tagged `Year 1` for now (the A1/A2/B1/B2 proposal was dropped). `Data/Formatted data/Year 1 - detailed.csv` is the user's own reviewed file, kept as a reference and not used by the app.
5. Interface language: English only.

## 9. Risks
- iOS Range/audio from the service worker (highest risk; tested at step 7, designed for in step 6).
- iOS clearing web storage: mitigated by inbox count and export.
- edge-tts is unofficial and could change or break; existing audio is unaffected, only new words are at risk.
- TTS may misread rare heteronyms or neutral tones; only a spot-check can catch these. Fix path: drop that word's audio.
- Single-device progress: no sync between devices.
- Home-screen install and update behaviour on iOS differs from desktop, so step 7 needs real-device testing.
