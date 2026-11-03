#!/usr/bin/env python3
"""Restore publisher-provided audio for a local, personally imported workbook."""
import argparse
import hashlib
import io
import json
import os
from pathlib import Path
import re
import sys
import tempfile
from urllib.request import Request, urlopen
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from n5.workbooks import validate_workbook


def restore_audio(catalog, archive_bytes):
    data = validate_workbook(json.loads(catalog.read_text(encoding='utf-8')))
    expected = {Path(a['filename']).name: a for a in data['assets'].values() if a['kind'] == 'audio'}
    with ZipFile(io.BytesIO(archive_bytes)) as archive:
        entries = {}
        for item in archive.infolist():
            if item.is_dir():
                continue
            name = Path(item.filename).name
            if not re.fullmatch(r'Track\d{3}\.mp3', name) or name not in expected or name in entries or item.file_size > 20_000_000:
                raise ValueError('Unexpected publisher archive entry')
            content = archive.read(item)
            if hashlib.sha256(content).hexdigest() != expected[name]['sha256']:
                raise ValueError('Audio changed; review the edition before importing')
            entries[name] = content
        if set(entries) != set(expected):
            raise ValueError('Incomplete audio archive')
    for name, content in entries.items():
        destination = catalog.parent / expected[name]['filename']
        destination.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(dir=destination.parent, delete=False) as output:
            temporary = Path(output.name)
            output.write(content)
        try:
            temporary.chmod(0o644)
            temporary.replace(destination)
        finally:
            temporary.unlink(missing_ok=True)
    return len(entries)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--catalog', type=Path, default=Path(os.environ.get('N5_MATERIALS_DIR', ROOT/'data/materials'))/'somatome/n5-2017/workbook.json')
    parser.add_argument('--download', action='store_true')
    args = parser.parse_args()
    if not args.catalog.is_file():
        parser.error('Restore your personal workbook.json backup first; source exercises are not distributed with the app.')
    data = validate_workbook(json.loads(args.catalog.read_text(encoding='utf-8')))
    if not args.download:
        print(f"{data['title']}: {len(data['items'])} exercises, {sum(a['kind']=='audio' for a in data['assets'].values())} audio tracks")
        return
    isbn = data['audio_source']['isbn']
    if not re.fullmatch(r'\d{13}', isbn):
        raise ValueError('Invalid publisher ISBN')
    url = f'https://player.ask-books.com/api/v1/books/{isbn}/audios.zip'
    with urlopen(Request(url, headers={'User-Agent':'N5Local-PersonalStudy/1.0'}), timeout=90) as response:
        content = response.read(100_000_001)
    if len(content) > 100_000_000:
        raise ValueError('Publisher archive too large')
    print(f'Restored {restore_audio(args.catalog, content)} original audio tracks')


if __name__ == '__main__':
    main()
