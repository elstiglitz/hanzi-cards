"""Build the app's data files from Words.csv and the audio manifest.

Writes docs/data/words.json and docs/data/precache.json (files to cache offline + version hash).
Usage: python build_data.py <Words.csv> <docs_dir>
"""
import csv, hashlib, json, re, sys
from pathlib import Path

words_csv, docs = Path(sys.argv[1]), Path(sys.argv[2])
audio_manifest = json.loads((docs / 'audio' / 'manifest.json').read_text(encoding='utf-8'))

words, seen = [], set()
for r in csv.DictReader(open(words_csv, encoding='utf-8', newline='')):
    zh, py = r['Chinese'].strip(), r['Pinyin'].strip()
    key = f'{zh}|{py}'
    wid = hashlib.sha1(key.encode('utf-8')).hexdigest()[:12]
    assert wid not in seen, f'duplicate id for {key}'
    assert key in audio_manifest, f'{key} missing from audio manifest'
    seen.add(wid)
    audio = audio_manifest[key]
    if audio:
        assert (docs / 'audio' / audio).exists(), f'missing audio file {audio}'
    words.append({'id': wid, 'zh': zh, 'py': py, 'en': r['English'].strip(),
                  'lesson': r['Lesson'].strip(), 'audio': audio})

(docs / 'data').mkdir(exist_ok=True)
(docs / 'data' / 'words.json').write_text(
    json.dumps(words, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')

# Everything the phone should cache, except the service worker and this list itself.
skip = {'sw.js', 'data/precache.json', 'audio/manifest.json'}
files = sorted(str(p.relative_to(docs)) for p in docs.rglob('*')
               if p.is_file() and p.name != '.DS_Store' and str(p.relative_to(docs)) not in skip)
h = hashlib.sha1()
for f in files:
    h.update(f.encode()); h.update((docs / f).read_bytes())
version = h.hexdigest()[:10]
(docs / 'data' / 'precache.json').write_text(
    json.dumps({'version': version, 'files': files}, ensure_ascii=False, indent=1), encoding='utf-8')

# Stamp the version into sw.js: browsers only fetch a new service worker when sw.js itself changes
sw = docs / 'sw.js'
text = sw.read_text(encoding='utf-8')
stamped = re.sub(r"const BUILD = '[^']*';", f"const BUILD = '{version}';", text)
assert stamped != text or f"'{version}'" in text, 'BUILD line not found in sw.js'
sw.write_text(stamped, encoding='utf-8')

print(f'{len(words)} words; {sum(1 for w in words if w["audio"])} with audio; '
      f'{len(files)} files to cache; version {version}')
