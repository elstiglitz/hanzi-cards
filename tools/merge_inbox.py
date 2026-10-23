"""Merge words exported from the phone's inbox into Words.csv, in two safe stages.

  prepare <inbox.csv>   Reads the export, drops duplicates (but an existing word with a new lesson is kept, to gain it), proposes pinyin for blanks and writes
                        Data/Inbox/review.csv for you to check. English is left for review.
  apply                 Reads the reviewed Data/Inbox/review.csv, checks every row is complete and
                        appends the rows to Words.csv (a word already in the deck with a new lesson just gains that lesson). Nothing is written if any row has a problem.

Run from the project folder with the project environment:
  .venv/bin/python tools/merge_inbox.py prepare ~/Downloads/inbox-2026-10-21.csv
  .venv/bin/python tools/merge_inbox.py apply

Audio and the data rebuild are separate steps (gen_audio.py, build_data.py): see CLAUDE.md.
"""
import csv, re, sys, unicodedata
from pathlib import Path

from pypinyin import Style, lazy_pinyin

ROOT = Path(__file__).resolve().parent.parent
WORDS = ROOT / 'Data' / 'Formatted data' / 'Words.csv'
REVIEW = ROOT / 'Data' / 'Inbox' / 'review.csv'
HEAD = ['Chinese', 'Pinyin', 'English', 'Lesson']
REVIEW_HEAD = HEAD + ['Note']
RADICALS = set('氵辶钅纟亻讠')   # components with no pinyin of their own
HAN = re.compile(r'[㐀-䶿一-鿿]')


def split_lessons(s):
    """'Year 1 / Year 2' -> ['Year 1', 'Year 2'] (no blanks, no repeats, order kept)."""
    return list(dict.fromkeys(x.strip() for x in (s or '').split('/') if x.strip()))


def join_lessons(names):
    return ' / '.join(names)


def norm_py(s):
    """Compare pinyin ignoring case, spaces, apostrophes and tone marks."""
    s = unicodedata.normalize('NFD', s or '')
    s = ''.join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"[\s']", '', s.lower())


def propose_pinyin(zh):
    """Dictionary pinyin with tone marks, syllables joined into one word. Phrases need a human eye."""
    if not HAN.search(zh):
        return ''
    # punctuation and spaces are dropped from the proposal; a human adds the spacing for phrases
    syl = lazy_pinyin(re.sub(r'[^\u3400-\u4dbf\u4e00-\u9fff]', '', zh), style=Style.TONE)
    out = syl[0]
    for s in syl[1:]:
        out += ("'" if s[0] in 'aāáǎàeēéěèoōóǒò' else '') + s   # apostrophe keeps syllables apart (nǚ'ér)
    return out


def read_rows(path):
    with open(path, encoding='utf-8-sig', newline='') as f:
        rows = [r for r in csv.reader(f) if any(c.strip() for c in r)]
    if rows and rows[0][0].strip().lower() == 'chinese':
        rows = rows[1:]
    return [(r + ['', '', '', ''])[:4] for r in rows]


def deck_index():
    deck = [dict(zip(HEAD, r)) for r in read_rows(WORDS)]
    return deck


def is_dup(zh, py, others):
    for o in others:
        if o['Chinese'] == zh and (not py or not o['Pinyin'] or norm_py(o['Pinyin']) == norm_py(py)):
            return o
    return None


def prepare(inbox_path):
    deck = deck_index()
    rows, notes, kept = [], [], []
    for zh, py, en, lesson in read_rows(inbox_path):
        zh, py, en, lesson = zh.strip(), py.strip(), en.strip(), lesson.strip()
        if not HAN.search(zh):
            notes.append(f'skipped {zh!r}: not Chinese')
            continue
        if (d := is_dup(zh, py, deck)):
            new = [l for l in split_lessons(lesson) if l not in split_lessons(d['Lesson'])]
            if not new:
                notes.append(f'skipped {zh}: already in the deck ({d["English"]})')
                continue
            kept.append({'Chinese': d['Chinese'], 'Pinyin': d['Pinyin'], 'English': d['English'],
                         'Lesson': join_lessons(new), 'Note': f'existing word: adds {join_lessons(new)}'})
            notes.append(f'{zh}: already in the deck, will add lesson {join_lessons(new)}')
            continue
        if (d := is_dup(zh, py, kept)):
            notes.append(f'skipped {zh}: listed twice in the export')
            continue
        note = []
        if not py:
            py = propose_pinyin(zh)
            note.append('pinyin proposed, check it' + ('; phrase: check spacing' if len(zh) > 3 else ''))
        if not en:
            note.append('English needed')
        kept.append({'Chinese': zh, 'Pinyin': py, 'English': en, 'Lesson': lesson, 'Note': '; '.join(note)})
    REVIEW.parent.mkdir(parents=True, exist_ok=True)
    with open(REVIEW, 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.DictWriter(f, REVIEW_HEAD)
        w.writeheader()
        w.writerows(kept)
    print(f'{len(kept)} word(s) written to {REVIEW.relative_to(ROOT)}')
    for n in notes:
        print('  -', n)
    todo = [k['Chinese'] for k in kept if 'English needed' in k['Note']]
    if todo:
        print(f'English still needed for: {", ".join(todo)}')
    print('Next: review the file, clear the Note column when happy, then run: merge_inbox.py apply')


def apply():
    if not REVIEW.exists():
        sys.exit(f'No review file at {REVIEW}. Run prepare first.')
    deck = deck_index()
    with open(REVIEW, encoding='utf-8-sig', newline='') as f:
        rows = [r for r in csv.DictReader(f) if (r.get('Chinese') or '').strip()]
    problems, ready, seen, changed = [], [], [], []
    for r in rows:
        zh, py, en, lesson = (r.get(k, '').strip() for k in HEAD)
        if not HAN.search(zh):
            problems.append(f'{zh!r}: not Chinese')
        elif not en:
            problems.append(f'{zh}: English is empty')
        elif not py and zh not in RADICALS:
            problems.append(f'{zh}: pinyin is empty')
        elif (d := is_dup(zh, py, deck)):
            have = split_lessons(d['Lesson'])
            new = [l for l in split_lessons(lesson) if l not in have]
            if not new:
                problems.append(f'{zh}: already in Words.csv' + (' with that lesson' if lesson else ''))
            elif any(c is d for c in changed):
                problems.append(f'{zh}: appears twice in the review file')
            else:
                d['Lesson'] = join_lessons(have + new)
                changed.append(d)
        elif is_dup(zh, py, seen):
            problems.append(f'{zh}: appears twice in the review file')
        else:
            ready.append({'Chinese': zh, 'Pinyin': py, 'English': en, 'Lesson': lesson})
            seen.append(ready[-1])
    if problems:
        print('Nothing was written. Fix these in the review file and run apply again:')
        for p in problems:
            print('  -', p)
        sys.exit(1)
    if not ready and not changed:
        sys.exit('The review file has no words to add.')
    # Words.csv uses Windows line endings; keep them so the diff stays small
    with open(WORDS, 'w', encoding='utf-8', newline='') as f:
        w = csv.writer(f, lineterminator='\r\n')
        w.writerow(HEAD)
        for r in deck + ready:
            w.writerow([r[k] for k in HEAD])
    print(f'Added {len(ready)} new word(s) to {WORDS.relative_to(ROOT)}:')
    for r in ready:
        print(f'  {r["Chinese"]}  {r["Pinyin"]}  {r["English"]}  [{r["Lesson"] or "no lesson"}]')
    for r in changed:
        print(f'  {r["Chinese"]}: lessons now {r["Lesson"]}')
    print('Next: generate audio (asks first, it sends text to Microsoft), rebuild data, commit, push.')


if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else ''
    if cmd == 'prepare' and len(sys.argv) == 3:
        prepare(sys.argv[2])
    elif cmd == 'apply' and len(sys.argv) == 2:
        apply()
    else:
        sys.exit(__doc__)
