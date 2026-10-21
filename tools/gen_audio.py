"""Generate one Mandarin MP3 per word in Words.csv with edge-tts (Xiaoxiao).

Sends only the Chinese column to Microsoft's endpoint. Resumable: existing files are skipped.
Usage: python gen_audio.py <Words.csv> <out_dir>
"""
import asyncio, csv, hashlib, json, sys
from pathlib import Path

import edge_tts

VOICE = 'zh-CN-XiaoxiaoNeural'
CONCURRENCY = 4
RETRIES = 4

words_csv, out_dir = Path(sys.argv[1]), Path(sys.argv[2])
out_dir.mkdir(parents=True, exist_ok=True)


def spoken(zh):
    return zh.replace('…', '，').replace('？', '').strip()


# No audio: neutral-tone suffix (TTS would read it as zǐ) and radicals (not spoken as standalone words)
NO_AUDIO = {'子|zi', '亻|', '讠|', '氵|', '辶|', '钅|', '纟|'}


def fname(key):
    return hashlib.sha1(key.encode('utf-8')).hexdigest()[:12] + '.mp3'


rows = list(csv.DictReader(open(words_csv, encoding='utf-8', newline='')))
manifest = {}
text_for = {}
for r in rows:
    k = r['Chinese'] + '|' + r['Pinyin']
    manifest[k] = None if k in NO_AUDIO else fname(k)
    text_for[k] = r['Chinese']
failed = []


async def one(sem, key):
    zh = text_for[key]
    path = out_dir / manifest[key]
    if path.exists() and path.stat().st_size > 0:
        return
    async with sem:
        for attempt in range(RETRIES):
            try:
                await edge_tts.Communicate(spoken(zh), VOICE).save(str(path))
                if path.stat().st_size > 0:
                    return
            except Exception as e:
                err = repr(e)
                await asyncio.sleep(2 * (attempt + 1))
        path.unlink(missing_ok=True)
        failed.append((zh, err))


async def main():
    sem = asyncio.Semaphore(CONCURRENCY)
    await asyncio.gather(*(one(sem, k) for k, f in manifest.items() if f))


asyncio.run(main())
(out_dir / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding='utf-8')
done = sum(1 for f in manifest.values() if f and (out_dir / f).exists())
print(f'{done}/{len(manifest)} files; {len(failed)} failed')
for zh, e in failed:
    print('FAILED', zh, e)
