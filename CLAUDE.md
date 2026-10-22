# Chinese App

Personal Mandarin flashcard app (PWA, offline, iPhone). Vocabulary source: `Data/Formatted data/Words.csv` (Chinese, Pinyin, English).

## Rules

- Always ask before sending any proprietary or personal data to an online service (APIs, TTS, translation, uploads, etc.). This includes the vocabulary list, any source course material and anything derived from them. Say what would be sent and to whom, and wait for approval. Approval covers only that specific request.
  - Standing consent (given by the user, Oct 2026): for THIS project only, generating audio for words with `tools/gen_audio.py` (it sends only the Chinese text of the words to Microsoft's edge-tts service) does not need to be asked about each time. Anything else (other services, other data, course material, pushing to GitHub) still needs approval.
- Keep raw source material out of git: everything under `Data/` except `Data/Formatted data/Words.csv` is ignored (see `.gitignore`).
-  Standing consent (Oct 2026): pushing app code and UI changes (docs/ HTML/CSS/JS, sw.js, notes) to main does not need asking each time. The user tests directly on the iPhone: build, commit, push, then say what to check. Still ask before pushing vocabulary or audio changes (Words.csv, docs/audio/, docs/data/).

## About the user
- The user is not a developer: explain choices simply.
- The user likes minimalist user interfaces. Show only what is needed by default; keep secondary controls, instructions and options hidden until requested (menus, popovers, on-demand panels). Prefer icons over labels, few colours, generous whitespace. Challenge any addition that adds visible clutter.

## Status (update after each step)
The app is finished, live and in use. All 8 steps of `PLAN.md` are done: data build, card viewer, three study modes (Guess / Recall / Listen), grading + spaced repetition + lesson filter, add words / bulk import / inbox / export, offline PWA with service worker, deployment, and the Mac-side merge tool. The full loop has been proven on a real phone: add a word on the phone, export, `merge_inbox.py`, audio, rebuild, push, "Update available" on the phone. The deck has 565 words (563 `Year 1`, 2 `Year 2`: 长城, 故宫), 558 with audio.

Next steps, in the order I suggested (the user has not picked yet):
1. Back up study progress (export/import). Progress lives only in the phone's browser storage; if iOS clears it or the phone changes, weeks of study are lost. Most important gap.
2. iPhone gestures (see Backlog). A first version (tap = sound, swipe up = hint/answer, swipe right/left = grade) was built, pushed and reverted in Oct 2026: the user found the swiping did not feel natural. It was imperfect, not rejected; the user may want to retry later, but for now the focus is a functional MVP. Find it in git history (commit 869de97, reverted by 08c5e64). Its UX notes: keep tap and swipe distinct, grade only after the answer, drag-to-cancel instead of undo.
3. Spot-check audio pronunciation of tricky words (neutral tones like 妈妈; 还行; 玩儿). Never done.
4. Smaller items in the Backlog. Suggested approach for the user: use the app for a few days first and let real use decide.

Lessons learned (do not repeat):
- Phones only update when `sw.js` itself changes. The build script stamps the version into it; always run the data build before committing a change to `docs/`.
- Never run `open <url>` after an edit: it reloads the user's browser to the home screen and looks like an app bug.
- Test update paths and anything browser-specific for real; unit tests of the logic missed the update bug.
- Unverified claims: say so. Many checks here only ran in simulation, not in a browser.

Unverified or open:
- Two-factor on the GitHub account (cannot be seen from here).
- Old commits are still fetchable by hash on GitHub after the history rewrite. Only GitHub support can purge them. The wording is mild; left as is unless the user asks.
- iOS status bar blur in the installed app: a workaround is in place (a solid strip at the top of the page). See KNOWN_ISSUES.md for where it lives and how to remove it once Apple fixes the blur.

## Live app
- Repo: https://github.com/elstiglitz/hanzi-cards (public). App: https://elstiglitz.github.io/hanzi-cards/ (GitHub Pages serves `docs/` from `main`).
- `main` is a single clean commit, published on purpose so old notes with personal details are not public. Full local history is on the local-only branches `backup-full-history` (older, contains personal details) and `backup-before-squash`; never push either. Repeat the squash approach (orphan branch, check, `git push --force-with-lease`) only if something private is ever published by mistake.
- Keep personal details (names, job, other accounts, local paths) out of every tracked file, including this one: the repo is public.
- Deploy an update: edit, run the data build (below), commit, then push to `main` (ask first, it is public). Phones show "Update available" next time they open the app online.
- Progress and the inbox live in each browser's storage (per address), so the phone, the Mac preview and the live site on the Mac are all separate.

## How to run
- Preview: `cd docs && python3 -m http.server 8765`, then open http://127.0.0.1:8765/ (refresh with Cmd+R; do not run `open` after every edit, it resets the browser to the home screen).
- ALWAYS rebuild data (command below) after changing anything in `docs/`: it refreshes `docs/data/precache.json` AND stamps the version into `docs/sw.js`. Phones only fetch an update when `sw.js` itself changes, so skipping the rebuild means no update banner.
- Add words from a phone export (the full loop):
  1. `.venv/bin/python tools/merge_inbox.py prepare <exported inbox csv>`: drops duplicates, proposes pinyin, writes `Data/Inbox/review.csv` (git-ignored). Then propose English for the blanks and have the user review the file.
  2. `.venv/bin/python tools/merge_inbox.py apply`: refuses if any row is incomplete or a duplicate; otherwise appends to Words.csv.
  3. Generate audio (standing consent, no need to ask), rebuild data, commit, then ask before pushing.
- Rebuild data after editing the CSV: `python3 tools/build_data.py "Data/Formatted data/Words.csv" docs`
- Generate audio for new words (standing consent; it sends only the Chinese text to Microsoft): `.venv/bin/python tools/gen_audio.py "Data/Formatted data/Words.csv" docs/audio`
- No Node, no build step. Plain HTML/CSS/JS in `docs/`. Python on the Mac only.
- Git author for this repo is Hugo Stiglitz (local config). End commit messages with `Assistant-model: Claude Code`. Pushes go to the public repo above (ask first).

## Decisions
- PWA on iPhone via Add to Home Screen, offline. Hosting: GitHub Pages from a public repo (vocabulary and audio become public; ask before pushing).
- Audio: pre-generated MP3s, Microsoft voice zh-CN-XiaoxiaoNeural via edge-tts. Keyed by `hanzi|pinyin`. No audio for the 6 radicals (氵 辶 钅 纟 亻 讠) and the suffix 子 (zi). Radicals stay in the deck on purpose (they help the user learn meanings).
- `Words.csv` columns: Chinese, Pinyin, English, Lesson. Original words are `Year 1`; words added since get the lesson given at import (e.g. `Year 2`). `Year 1 - detailed.csv` is the user's own reviewed file, kept in case they change their mind; do not use it unless asked. One pinyin reading per word (还 = hái, 玩儿 = wánr). Words joined, phrases spaced.
- Modes: Guess (see character; hint = pinyin), Recall (see English; no hint), Listen (autoplay audio; hint = pinyin; 7 no-audio words excluded). Shuffled by default, S toggles.
- Up arrow per card: Guess = hint, audio, answer; Listen = hint, answer; Recall = answer; after the answer it replays the audio. Down hides the hint. Space plays audio. Return reveals.
- Grading replaces prev/next: before the answer, right arrow skips (no grade); after it, right = got it, left = missed. Leitner boxes 1/2/4/8/16 days; a hint moves the card back a box; progress is per word AND per mode, saved in localStorage; 10 new cards a day per mode; due cards first. Missed cards come back later in the same session without a second schedule change.
- Step 7 decisions (Oct 2026): published from a dedicated GitHub account as a public repo (accepted by the user); commit identity is Hugo Stiglitz. Never push without the user's explicit go-ahead.
- Words added on the phone go to an inbox (not studied) and are exported via the share sheet to the Mac, where audio is generated (standing consent). Both single add and bulk import (same 3-4 columns, duplicate detection).
- English-only UI.

## Backlog / reminders
- Cleanup session: replace the big speaker emoji shown in Listen mode with a nicer image (keep the small speaker button).
- iPhone gestures (scope later): tap card = play sound, swipe up = hint, double swipe up = answer, swipe right/left = got it/missed. No touch controls for hint or shuffle yet.
- Future idea: a "knowledge acquired level" per card, and stop showing mastered cards. Progress records (box, due, seen, last) are designed to allow this.
- The 7 no-audio words still appear in Guess/Recall with a blank speaker slot.
- Optional: a hidden "pretend it's tomorrow" testing option for due dates.
