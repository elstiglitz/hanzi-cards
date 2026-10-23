'use strict';

const $ = (id) => document.getElementById(id);

// One set of line icons (same stroke everywhere) instead of emoji and text symbols
const ICON_PATHS = {
  speaker: '<path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4z"/><path d="M15.5 9a4 4 0 010 6M18 6.5a8 8 0 010 11"/>',
  bulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 00-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0012 3z"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  cross: '<path d="M6 6l12 12M18 6L6 18"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
};
const icon = (name, size = 24) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name]}</svg>`;

// Study modes. hint: can the pinyin be shown before the answer? auto: play audio when a card appears.
// upAudio: does the up-arrow sequence include a play step? (not in listen: it already played; not in recall: it gives the answer away)
const MODES = {
  guess:  { hint: true, upAudio: true, desc: 'See the character' },
  recall: { hint: false, desc: 'See the English' },
  listen: { hint: true, auto: true, desc: 'Hear the word' },
};
const SCREENS = ['', 'words', 'add', 'settings', ...Object.keys(MODES)];

// Spaced repetition (Leitner boxes). Box 1..5 = days until the card is due again.
const INTERVALS = [0, 1, 2, 4, 8, 16];
const NONE = '__none';    // lesson filter value for words with no lesson

// Help panel content per mode: short tips, then keyboard rows (keyboard rows are desktop only)
const HELP = {
  guess:  { tip: 'Tap the card to see the answer.', up: 'Hint, audio, answer', down: true, space: 'Play audio' },
  recall: { tip: 'Tap the card to see the answer.', up: 'Answer', down: false, space: 'Play audio' },
  listen: { tip: 'The word plays on its own. Tap the card to see the answer.', up: 'Hint, answer', down: true, space: 'Replay audio' },
};
const LEGEND = [
  ['speaker', 'Play the sound'],
  ['bulb', 'Show the pinyin. Before the answer it counts against you.'],
  ['cross', 'Missed (after the answer)'],
  ['check', 'Got it (after the answer)'],
  ['arrow', 'Skip (before the answer)'],
];
const K = (...keys) => keys.map((k) => `<kbd>${k}</kbd>`).join(' ');

function renderHelp() {
  const h = HELP[mode];
  const rows = [
    ['Show / hide answer', K('Return')],
    [h.up, K('&uarr;')],
    ...(h.down ? [['Hide hint', K('&darr;')]] : []),
    [h.space, K('Space')],
    ['Skip (before the answer)', K('&rarr;')],
    ['Got it / missed (after)', K('&rarr;', '&larr;')],
    ['Shuffle', K('S')],
    ['Help / close', K('?', 'Esc')],
  ];
  $('help').innerHTML =
    `<p class="help-tip">${h.tip}</p>` +
    `<div class="legend">${LEGEND.map(([n, t]) => `<div class="legend-row">${icon(n, 22)}<span>${t}</span></div>`).join('')}</div>` +
    `<div class="desktop-only"><h2>Keyboard</h2>` +
    rows.map(([label, keys]) => `<div class="key-row"><span>${label}</span><span>${keys}</span></div>`).join('') +
    `</div>`;
}

/* ---- saved progress (on this device only) ---- */
const STORE_KEY = 'hanzi.v1';
const DEFAULT_SETTINGS = { perDay: 10, theme: 'auto', shuffle: true, autoplay: true };   // perDay is per mode
let store = { progress: { guess: {}, recall: {}, listen: {} }, daily: { date: 0, new: {} }, lesson: '', settings: { ...DEFAULT_SETTINGS } };

function loadStore() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY));
    if (s && s.progress) store = { ...store, ...s, settings: { ...DEFAULT_SETTINGS, ...s.settings } };
  } catch (e) { /* storage unavailable or corrupt: start fresh */ }
  for (const m of Object.keys(MODES)) store.progress[m] = store.progress[m] || {};
}

function saveStore() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (e) { /* ignore */ }
}

// day number in local time, so "due tomorrow" flips at your midnight
function today() {
  const d = new Date();
  return Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000);
}

function newToday(m) {
  if (store.daily.date !== today()) store.daily = { date: today(), new: {} };
  return store.daily.new[m] || 0;
}

// Record an answer. Got it moves the card up a box, a hint moves it back one, a miss sends it to box 1.
function record(w, ok, usedHint) {
  const p = store.progress[mode];
  const prev = p[w.id];
  let box = prev ? prev.box : 0;
  if (!prev) store.daily.new[mode] = newToday(mode) + 1;
  if (!ok) box = 1;
  else if (usedHint) box = Math.max(1, box - 1);
  else box = Math.min(5, Math.max(box, 1) + 1);
  p[w.id] = { box, due: today() + INTERVALS[box], seen: (prev ? prev.seen : 0) + 1, last: ok ? 1 : 0 };
  saveStore();
}

/* ---- session ---- */
let words = [];
let mode = 'guess';
let queue = [];            // [{ w, group, rank }]; queue[0] is the current card. group 0 due, 1 new, 2 retry
let relearn = new Set();   // cards missed in this session: shown again, no further schedule change
let session = { reviewed: 0, skipped: 0 };
let rankCounter = 0;
let shuffled = true;       // shuffled by default; S switches to the original order
let revealed = false;
let hinted = false;        // pinyin currently shown as a hint
let usedHint = false;      // a hint was used on this card (counts against it)
let upStep = 0;
const audio = new Audio();

const current = () => (queue[0] ? queue[0].w : null);

function play(w) {
  if (!w || !w.audio) return;
  audio.src = 'audio/' + w.audio;
  audio.play().catch(() => {});   // the browser may block autoplay until the first tap
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {   // Fisher-Yates
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// A word can sit in several lessons; w.lessons is a list (empty = unassigned).
function inLesson(w, l) {
  return !l || (l === NONE ? !w.lessons.length : w.lessons.includes(l));
}
// Lessons are written 'Year 1 / Year 2' in the CSV and in the inbox.
const splitLessons = (s) => [...new Set((s || '').split('/').map((x) => x.trim()).filter(Boolean))];
const lessonNames = () => [...new Set(words.flatMap((w) => w.lessons))].sort();

function inScope(w) {
  return inLesson(w, store.lesson);
}

// Cards for a mode: due for review first, then up to the daily allowance of new ones.
function plan(m) {
  const p = store.progress[m];
  const t = today();
  const pool = words.filter((w) => inScope(w) && (m !== 'listen' || w.audio));
  const due = pool.filter((w) => p[w.id] && p[w.id].due <= t).sort((a, b) => p[a.id].due - p[b.id].due);
  const allowance = Math.max(0, store.settings.perDay - newToday(m));
  const fresh = pool.filter((w) => !p[w.id]).slice(0, allowance);
  return { due, fresh };
}

// due cards, then new, then retries; shuffled within each group unless shuffle is off
function order(items) {
  const out = [];
  for (const g of [0, 1, 2]) {
    const grp = items.filter((x) => x.group === g);
    if (shuffled) shuffle(grp); else grp.sort((a, b) => a.rank - b.rank);
    out.push(...grp);
  }
  return out;
}

function startMode(name) {
  mode = name;
  shuffled = store.settings.shuffle;
  renderHelp();
  const { due, fresh } = plan(name);
  let r = 0;
  queue = order([...due.map((w) => ({ w, group: 0, rank: r++ })), ...fresh.map((w) => ({ w, group: 1, rank: r++ }))]);
  rankCounter = r;
  relearn = new Set();
  session = { reviewed: 0, skipped: 0 };
  newCard();
}

function toggleShuffle() {
  shuffled = !shuffled;
  if (queue.length > 1) queue = [queue[0], ...order(queue.slice(1))];   // the current card stays put
}

function newCard() {
  upStep = 0;
  revealed = false;
  hinted = false;
  usedHint = false;
  renderCard();
  if (MODES[mode].auto && store.settings.autoplay) play(current());
}

function retry(item) { queue.push({ w: item.w, group: 2, rank: rankCounter++ }); }

function grade(ok) {
  const item = queue[0];
  if (!item || !revealed) return;
  queue.shift();
  if (relearn.has(item.w.id)) {
    if (ok) relearn.delete(item.w.id); else retry(item);   // second look: no schedule change
  } else {
    record(item.w, ok, usedHint);
    session.reviewed++;
    if (!ok) { relearn.add(item.w.id); retry(item); }
  }
  newCard();
}

function skip() {
  if (!queue.length || revealed) return;
  queue.shift();
  session.skipped++;
  newCard();
}

function arrowRight() { if (revealed) grade(true); else skip(); }
function arrowLeft() { if (revealed) grade(false); }

/* ---- navigation: the URL hash picks the screen, so the browser's back button works too ---- */
function currentScreen() {
  const h = location.hash.replace(/^#\/?/, '');
  return SCREENS.includes(h) ? h : '';
}

function route() {
  const name = currentScreen();
  const isMode = name in MODES;
  $('home-view').hidden = name !== '';
  $('card-view').hidden = !isMode;
  if (name === 'words') showLessonChooser();
  $('lessons-view').hidden = name !== 'words' || listLesson !== null;
  $('list-view').hidden = name !== 'words' || listLesson === null;
  $('add-view').hidden = name !== 'add';
  $('settings-view').hidden = name !== 'settings';
  $('back').hidden = name === '';
  $('brand').hidden = name !== '';
  $('bar').classList.toggle('home-bar', name === '');
  $('menu-btn').hidden = name !== '';
  setMenu(false);
  $('help-btn').hidden = !isMode;
  setHelp(false);
  audio.pause();
  if (name === '') renderHome();
  if (name === 'add') renderAdd();
  if (name === 'settings') renderSettings();
  if (isMode) startMode(name);
}

function route2() {
  $('lessons-view').hidden = false;
  $('list-view').hidden = true;
}

function navigate(name) { location.hash = name; }

function setMenu(open) {
  $('menu').hidden = !open;
  $('menu-btn').setAttribute('aria-expanded', open);
}

function setHelp(open) {
  $('help').hidden = !open;
  $('help-btn').setAttribute('aria-expanded', open);
}

/* ---- settings ---- */
function applyTheme() {
  const t = store.settings.theme;
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
  // the status bar area follows the page colour: forced by the setting, or by the phone's own mode
  const colours = { light: '#fbf5f0', dark: '#1e1311' };
  document.querySelectorAll('meta[name=theme-color]').forEach((m) => {
    const own = m.media.includes('dark') ? 'dark' : 'light';
    m.content = colours[t === 'light' || t === 'dark' ? t : own];
  });
}

function renderSettings() {
  const st = store.settings;
  $('set-perday').value = String(st.perDay);
  $('set-theme').value = st.theme;
  $('set-shuffle').checked = st.shuffle;
  $('set-autoplay').checked = st.autoplay;
}

function wireSettings() {
  const st = store.settings;
  const change = (id, fn) => $(id).addEventListener('change', (e) => { fn(e.target); saveStore(); });
  change('set-perday', (el) => { st.perDay = +el.value; });
  change('set-theme', (el) => { st.theme = el.value; applyTheme(); });
  change('set-shuffle', (el) => { st.shuffle = el.checked; });
  change('set-autoplay', (el) => { st.autoplay = el.checked; });
}

/* ---- home ---- */
function renderHome() {
  $('sub-add').textContent = inbox.items.length ? `${inbox.items.length} waiting` : '';
}

function initLessons() {
  const sel = $('lesson');
  sel.append(new Option('All lessons', ''));
  lessonNames().forEach((n) => sel.append(new Option(n, n)));
  if (words.some((w) => !w.lessons.length)) sel.append(new Option('Unassigned', NONE));
  sel.value = [...sel.options].some((o) => o.value === store.lesson) ? store.lesson : '';
  store.lesson = sel.value;
  const showName = () => { $('lesson-name').textContent = sel.options[sel.selectedIndex].text; };
  showName();
  sel.addEventListener('change', () => { store.lesson = sel.value; saveStore(); showName(); renderHome(); });
}

/* ---- cards ---- */
// hidden text collapses so the visible text stays centred
function show(id, on) {
  const el = $(id);
  el.style.visibility = '';
  el.style.display = on ? '' : 'none';
}

function renderCard() {
  const w = current();
  const finished = !w;
  $('card').hidden = finished;
  $('actions').hidden = finished;
  $('done').hidden = !finished;
  if (finished) {
    const { reviewed, skipped } = session;
    $('done-title').textContent = reviewed || skipped ? 'All done' : 'Nothing due';
    $('done-sub').textContent = reviewed || skipped
      ? [`${reviewed} reviewed`, skipped ? `${skipped} skipped` : ''].filter(Boolean).join(' · ')
      : 'Come back later, or try another mode.';
    return;
  }
  $('card').className = 'mode-' + mode;
  $('zh').textContent = w.zh;
  $('zh').classList.toggle('long', [...w.zh].length > 4);
  $('py').textContent = w.py;
  $('en').textContent = w.en;
  // Guess and Recall show only the question side, then only the answer side. Listen reveals everything.
  if (mode === 'listen') {
    show('zh', revealed); show('py', hinted); show('en', revealed);
  } else {
    const front = mode === 'guess' ? 'zh' : 'en', back = mode === 'guess' ? 'en' : 'zh';
    show(front, !revealed);
    show(back, revealed);
    show('py', hinted);
  }
  const canHint = !!w.py;   // every mode, before and after the answer
  $('hint').style.visibility = canHint ? 'visible' : 'hidden';
  $('hint').classList.toggle('on', hinted);
  $('listen-icon').hidden = mode !== 'listen' || revealed;
  $('speak').style.visibility = w.audio ? 'visible' : 'hidden';   // no audio file => no speaker button
  // before the answer: right arrow skips, nothing on the left. After: Missed / Got it.
  $('miss').style.visibility = revealed ? 'visible' : 'hidden';
  $('ok').innerHTML = icon(revealed ? 'check' : 'arrow');
  $('ok').classList.toggle('good', revealed);
  $('ok').setAttribute('aria-label', revealed ? 'Got it' : 'Skip');
}

function toggleReveal() {
  if (!current()) return;
  revealed = !revealed;
  if (!revealed) upStep = 0;
  renderCard();
}

// Before the answer a hint counts against the card; after it, the pinyin is free to look at.
function setHint(on) {
  const w = current();
  if (w && w.py) {
    hinted = on;
    if (on && !revealed) usedHint = true;
    renderCard();
  }
}

// Up arrow steps through a card. Guess: hint, audio, answer. Listen: hint, answer (it already played).
// Recall: straight to the answer. Steps that do not apply are skipped (no pinyin, no audio).
// Once revealed, up replays the audio.
function arrowUp(e) {
  const w = current();
  if (!w || e.repeat) return;
  if (revealed) { play(w); return; }
  const steps = [];
  if (MODES[mode].hint && w.py) steps.push(() => setHint(true));
  if (MODES[mode].upAudio && w.audio) steps.push(() => play(w));
  steps.push(toggleReveal);
  steps[Math.min(upStep++, steps.length - 1)]();
}
function arrowDown() { upStep = 0; setHint(false); }

/* ---- all words ---- */
// All words: first a choice of lessons (or everything), then the list. null = still choosing.
let listLesson = null;

function showLessonChooser() {
  listLesson = null;
  const box = $('lessons-view');
  box.textContent = '';
  const choices = [['All words', words.length, '']];
  lessonNames().forEach((n) => choices.push([n, words.filter((w) => w.lessons.includes(n)).length, n]));
  const none = words.filter((w) => !w.lessons.length).length;
  if (none) choices.push(['Unassigned', none, NONE]);
  for (const [label, count, value] of choices) {
    const b = Object.assign(document.createElement('button'), { className: 'home-item' });
    b.append(label, Object.assign(document.createElement('small'), { textContent: count + ' words' }));
    b.addEventListener('click', () => openList(value));
    box.append(b);
  }
}

function openList(lesson) {
  listLesson = lesson;
  $('search').value = '';
  $('lessons-view').hidden = true;
  $('list-view').hidden = false;
  renderList('');
}

function renderList(filter) {
  const q = (filter || '').trim().toLowerCase();
  const pool = words.filter((w) => inLesson(w, listLesson));
  const items = pool.filter((w) =>
    !q || w.zh.includes(q) || w.py.toLowerCase().includes(q) || w.en.toLowerCase().includes(q));
  const ul = $('list');
  ul.textContent = '';
  const frag = document.createDocumentFragment();
  for (const w of items) {
    const li = document.createElement('li');
    const zh = Object.assign(document.createElement('span'), { className: 'l-zh', lang: 'zh-Hans', textContent: w.zh });
    const py = Object.assign(document.createElement('span'), { className: 'l-py', textContent: w.py });
    const en = Object.assign(document.createElement('span'), { className: 'l-en', textContent: w.en });
    li.append(zh, py, en);
    if (w.audio) {
      const b = Object.assign(document.createElement('button'), { className: 'l-play', innerHTML: icon('speaker', 20) });
      b.setAttribute('aria-label', 'Play ' + w.zh);
      b.addEventListener('click', () => play(w));
      li.append(b);
    }
    frag.append(li);
  }
  ul.append(frag);
  $('list-count').textContent = `${items.length} of ${pool.length} words`;
}

/* ---- adding words: they wait in an inbox until synced on the Mac, where audio is generated ---- */
const INBOX_KEY = 'hanzi.inbox.v1';
const HAN = /[㐀-䶿一-鿿]/;
let inbox = { items: [], exportedCsv: '' };
let editing = -1;   // index of the inbox word being edited, or -1

function loadInbox() {
  try {
    const s = JSON.parse(localStorage.getItem(INBOX_KEY));
    if (s && Array.isArray(s.items)) inbox = { ...inbox, ...s };
  } catch (e) { /* storage unavailable or corrupt: start empty */ }
}

function saveInbox() {
  try { localStorage.setItem(INBOX_KEY, JSON.stringify(inbox)); } catch (e) { /* ignore */ }
}

// compare pinyin ignoring case, spaces, apostrophes and tone marks, so "peng you" matches "péngyǒu"
const normPy = (s) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[\s']/g, '');

// Parse comma- or tab-separated text (pasted from a spreadsheet or a CSV file), with "quoted, fields".
function parseDelimited(text) {
  text = text.replace(/^﻿/, '');
  const firstLine = text.split(/\r?\n/).find((l) => l.trim()) || '';
  const delim = firstLine.includes('\t') ? '\t' : ',';
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"' && field === '') quoted = true;
    else if (c === delim) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      rows.push(row); row = [];
    } else field += c;
  }
  row.push(field);
  rows.push(row);
  return rows.filter((r) => r.some((f) => f.trim()));
}

function parseBulk(text) {
  let rows = parseDelimited(text);
  if (rows.length && rows[0][0].trim().toLowerCase() === 'chinese') rows = rows.slice(1);   // header row
  return rows.map((r) => ({ zh: (r[0] || '').trim(), py: (r[1] || '').trim(), en: (r[2] || '').trim(), lesson: (r[3] || '').trim() }));
}

const csvCell = (v) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
function toCsv(items) {
  return ['Chinese,Pinyin,English,Lesson', ...items.map((e) => [e.zh, e.py, e.en, e.lesson].map(csvCell).join(','))].join('\n') + '\n';
}

// Why an entry cannot be added, or null. Same character with a different pinyin is allowed (e.g. 子 zǐ / zi).
function checkEntry(e, skipIndex = -1) {
  if (!HAN.test(e.zh)) return { kind: 'invalid' };
  const same = (o) => o.zh === e.zh && (!e.py || !o.py || normPy(o.py) === normPy(e.py));
  const inDeck = words.find(same);
  // A word already in the deck may still be added if it brings a lesson the deck word lacks.
  if (inDeck && !splitLessons(e.lesson).some((l) => !inDeck.lessons.includes(l))) return { kind: 'deck', word: inDeck };
  if (inbox.items.some((o, i) => i !== skipIndex && same(o))) return { kind: 'inbox' };
  return null;
}

function why(e, r) {
  if (r.kind === 'invalid') return 'Enter a Chinese word or character.';
  if (r.kind === 'deck') {
    const l = r.word.lessons.join(' / ');
    return `${e.zh} is already in your deck (${r.word.en})${l ? ', in ' + l : ''}. To add it to another lesson, enter that lesson.`;
  }
  return `${e.zh} is already waiting.`;
}

function formEntry() {
  return { zh: $('f-zh').value.trim(), py: $('f-py').value.trim(), en: $('f-en').value.trim(), lesson: $('f-lesson').value.trim() };
}

function resetForm() {
  editing = -1;
  for (const id of ['f-zh', 'f-py', 'f-en', 'f-lesson']) $(id).value = '';
  $('f-submit').textContent = 'Add';
  $('f-cancel').hidden = true;
}

function submitForm(ev) {
  ev.preventDefault();
  const e = formEntry();
  const bad = checkEntry(e, editing);
  if (bad) { $('f-msg').textContent = why(e, bad); return; }
  if (editing >= 0) inbox.items[editing] = { ...inbox.items[editing], ...e };
  else inbox.items.push({ ...e, addedAt: Date.now() });
  saveInbox();
  const verb = editing >= 0 ? 'Saved' : 'Added';
  resetForm();
  $('f-msg').textContent = `${verb} ${e.zh}.`;
  renderInbox();
  $('f-zh').focus();
}

function runBulk(text) {
  let added = 0;
  const skipped = [];
  for (const e of parseBulk(text)) {
    const bad = checkEntry(e);
    if (bad) { skipped.push(`${e.zh || '(blank)'} (${bad.kind === 'deck' ? 'in deck' : bad.kind === 'inbox' ? 'waiting' : 'not Chinese'})`); continue; }
    inbox.items.push({ ...e, addedAt: Date.now() });
    added++;
  }
  if (added) saveInbox();
  const shown = skipped.slice(0, 5).join(', ') + (skipped.length > 5 ? ', …' : '');
  $('bulk-msg').textContent = `Added ${added}` + (skipped.length ? ` · skipped ${skipped.length}: ${shown}` : '') + '.';
  if (added) $('bulk-text').value = '';
  renderInbox();
}

function renderInbox() {
  const items = inbox.items;
  $('inbox').hidden = items.length === 0;
  $('inbox-count').textContent = items.length ? `(${items.length})` : '';
  const ul = $('inbox-list');
  ul.textContent = '';
  items.forEach((e, i) => {
    const li = document.createElement('li');
    const row = document.createElement('button');
    row.type = 'button'; row.className = 'row';
    row.append(
      Object.assign(document.createElement('span'), { className: 'i-zh', lang: 'zh-Hans', textContent: e.zh }),
      Object.assign(document.createElement('span'), { className: 'i-py', textContent: e.py }),
      Object.assign(document.createElement('span'), { className: 'i-en', textContent: [e.en, e.lesson].filter(Boolean).join(' · ') }));
    row.addEventListener('click', () => startEdit(i));
    const del = Object.assign(document.createElement('button'), { type: 'button', className: 'del', textContent: '×' });
    del.setAttribute('aria-label', 'Remove ' + e.zh);
    del.addEventListener('click', () => removeItem(i));
    li.append(row, del);
    ul.append(li);
  });
  // "Clear inbox" only appears once this exact list has been exported, and only the user clears it
  const exported = items.length > 0 && inbox.exportedCsv === toCsv(items);
  $('exported-row').hidden = !exported;
  $('exported-msg').textContent = exported ? `Exported ${items.length}. Safe on the Mac?` : '';
}

function renderAdd() {
  const lessons = new Set([...lessonNames(), ...inbox.items.flatMap((e) => splitLessons(e.lesson))]);
  const dl = $('lesson-options');
  dl.textContent = '';
  lessons.forEach((l) => dl.append(new Option(l)));
  resetForm();
  for (const id of ['f-msg', 'bulk-msg', 'inbox-msg']) $(id).textContent = '';
  renderInbox();
}

function startEdit(i) {
  const e = inbox.items[i];
  editing = i;
  $('f-zh').value = e.zh; $('f-py').value = e.py; $('f-en').value = e.en; $('f-lesson').value = e.lesson;
  $('f-submit').textContent = 'Save';
  $('f-cancel').hidden = false;
  $('f-msg').textContent = '';
  $('f-zh').focus();
  $('f-zh').scrollIntoView({ block: 'center' });
}

function removeItem(i) {
  inbox.items.splice(i, 1);
  saveInbox();
  if (editing >= 0) resetForm();
  renderInbox();
}

// Share sheet with a CSV file (AirDrop / Files on iPhone); falls back to a download on desktop.
async function exportInbox() {
  const csv = toCsv(inbox.items);
  const name = `inbox-${new Date().toISOString().slice(0, 10)}.csv`;
  const file = new File(['﻿' + csv], name, { type: 'text/csv' });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Hanzi inbox' });
    } else {
      const url = URL.createObjectURL(file);
      const a = Object.assign(document.createElement('a'), { href: url, download: name });
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  } catch (err) {
    if (err.name !== 'AbortError') $('inbox-msg').textContent = 'Could not export. Try Copy as text.';
    return;   // cancelled or failed: nothing is marked as exported
  }
  inbox.exportedCsv = csv;
  saveInbox();
  $('inbox-msg').textContent = '';
  renderInbox();
}

async function copyInbox() {
  const csv = toCsv(inbox.items);
  try {
    await navigator.clipboard.writeText(csv);
  } catch (err) {
    $('inbox-msg').textContent = 'Could not copy. Use Export instead.';
    return;
  }
  inbox.exportedCsv = csv;
  saveInbox();
  $('inbox-msg').textContent = 'Copied. Paste it into a note or message to yourself.';
  renderInbox();
}

function clearInbox() {
  inbox.items = [];
  inbox.exportedCsv = '';
  saveInbox();
  resetForm();
  $('inbox-msg').textContent = '';
  renderInbox();
}

function wireAdd() {
  $('add-form').addEventListener('submit', submitForm);
  $('f-cancel').addEventListener('click', () => { resetForm(); $('f-msg').textContent = ''; });
  $('bulk-go').addEventListener('click', () => runBulk($('bulk-text').value));
  $('bulk-file').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (f) runBulk(await f.text());
  });
  $('export').addEventListener('click', exportInbox);
  $('copy').addEventListener('click', copyInbox);
  $('clear').addEventListener('click', clearInbox);
}

async function init() {
  loadStore();
  loadInbox();
  words = await (await fetch('data/words.json')).json();
  initLessons();
  $('miss').innerHTML = icon('cross');
  $('speak').innerHTML = icon('speaker');
  $('hint').innerHTML = icon('bulb');
  $('listen-icon').innerHTML = icon('speaker', 96);
  wireAdd();
  applyTheme();
  wireSettings();
  $('go-settings').addEventListener('click', () => navigate('settings'));
  $('menu-btn').addEventListener('click', (e) => { e.stopPropagation(); setMenu($('menu').hidden); });
  for (const name of [...Object.keys(MODES), 'words', 'add']) {
    $('go-' + name).addEventListener('click', () => navigate(name));
  }
  $('back').addEventListener('click', () => {
    // inside a lesson's list, Back returns to the lesson choice first
    if (currentScreen() === 'words' && listLesson !== null) { showLessonChooser(); route2(); }
    else navigate('');
  });
  window.addEventListener('hashchange', route);

  $('card').addEventListener('click', toggleReveal);
  $('miss').addEventListener('click', () => grade(false));
  $('ok').addEventListener('click', arrowRight);
  $('speak').addEventListener('click', () => play(current()));
  $('hint').addEventListener('click', () => setHint(!hinted));
  $('help-btn').addEventListener('click', (e) => { e.stopPropagation(); setHelp($('help').hidden); });
  $('search').addEventListener('input', (e) => renderList(e.target.value));

  document.addEventListener('click', (e) => {
    // tapping anywhere outside the help panel closes it
    if (!e.target.closest('#help')) setHelp(false);
    if (!e.target.closest('#menu')) setMenu(false);
    // drop focus after a click so Return/Space shortcuts never double-trigger a focused button
    const b = e.target.closest('button');
    if (b) b.blur();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { setHelp(false); return; }
    if (e.target.id === 'search' || e.target.id === 'lesson' || !(currentScreen() in MODES)) return;
    const keys = {
      ArrowRight: arrowRight, ArrowLeft: arrowLeft,
      ArrowUp: arrowUp, ArrowDown: arrowDown,
      Enter: toggleReveal, ' ': () => play(current()),
      s: toggleShuffle, '?': () => setHelp($('help').hidden),
    };
    if (keys[e.key]) { e.preventDefault(); keys[e.key](e); }
  });

  route();
}

/* ---- offline: install the service worker, offer updates, ask the browser to keep our data ---- */
function setupOffline() {
  if (!('serviceWorker' in navigator)) return;
  // iOS can clear web storage under pressure; asking is cheap and protects progress and the inbox
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  navigator.serviceWorker.register('sw.js').then((reg) => {
    const offer = (worker) => {
      $('update').hidden = false;
      $('update').onclick = () => worker.postMessage('skipWaiting');
    };
    // an update that finished installing earlier and is waiting
    if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) offer(w);
      });
    });
    // check for a new version whenever the app is opened again
    document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); });
  }).catch(() => { /* offline support is optional; the app still works online */ });
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    location.reload();
  });
}
setupOffline();

init().catch((err) => {
  document.body.insertAdjacentHTML('beforeend', `<p style="color:#b3261e">Could not load words: ${err.message}</p>`);
});
