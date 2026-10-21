# Chinese App

Personal Mandarin flashcard app (PWA, offline, iPhone). Vocabulary source: `Data/Formatted data/Words.csv` (Chinese, Pinyin, English).

## Rules

- Always ask before sending any proprietary or personal data to an online service (APIs, TTS, translation, uploads, etc.). This includes the vocabulary list, any source course material and anything derived from them. Say what would be sent and to whom, and wait for approval. Approval covers only that specific request.
  - Standing consent (given by the user, Oct 2026): for THIS project only, generating audio for words with `tools/gen_audio.py` (it sends only the Chinese text of the words to Microsoft's edge-tts service) does not need to be asked about each time. Anything else (other services, other data, course material, pushing to GitHub) still needs approval.
- Keep raw source material out of git: everything under `Data/` except `Data/Formatted data/Words.csv` is ignored (see `.gitignore`).

## About the user
- The user is not a developer: explain choices simply.
- The user likes minimalist user interfaces. Show only what is needed by default; keep secondary controls, instructions and options hidden until requested (menus, popovers, on-demand panels). Prefer icons over labels, few colours, generous whitespace. Challenge any addition that adds visible clutter.

## Status (update after each step)
Build plan: see `PLAN.md`. Done: steps 1-7 (data build, card viewer, three study modes, grading + spaced repetition + lesson filter, add words / bulk import / inbox / export, manifest + icons + service worker, deployed). Offline install on iPhone has been tested and works, including audio. Step 8 built: `tools/merge_inbox.py` (tested on a copy with a fake export; not yet run on a real phone export). Next: do the real phone -> Mac -> phone round trip with the first exported inbox.

## Live app
- Repo: https://github.com/elstiglitz/hanzi-cards (public). App: https://elstiglitz.github.io/hanzi-cards/ (GitHub Pages serves `docs/` from `main`).
- `main` is a single clean commit, published on purpose so old notes with personal details are not public. The full local history is on the local-only branch `backup-full-history`; never push it.
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
- `Words.csv` columns: Chinese, Pinyin, English, Lesson. All words are `Year 1` for now. `Year 1 - detailed.csv` is the user's own reviewed file, kept in case they change their mind; do not use it unless asked. One pinyin reading per word (还 = hái, 玩儿 = wánr). Words joined, phrases spaced.
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
