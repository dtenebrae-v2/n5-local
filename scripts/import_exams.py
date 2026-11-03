#!/usr/bin/env python3
"""Restore a private exam from its reviewed manifest and original PDF/OPUS files."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from n5.exam_sets import validate_exam


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def import_exam(source, destination, manifest):
    data = json.loads(Path(manifest).read_text())
    source, destination = Path(source).resolve(), Path(destination).resolve()
    files = {}
    for kind, spec in data['sources'].items():
        path = (source / spec['filename']).resolve()
        if not path.is_relative_to(source) or digest(path) != spec['sha256']:
            raise ValueError(f'Source checksum mismatch: {kind}')
        files[kind] = path
    destination.mkdir(parents=True, exist_ok=True)
    # Build and validate everything before replacing any of the existing assets.
    with tempfile.TemporaryDirectory(prefix='exam-import-', dir=destination) as temporary:
        stage = Path(temporary)
        for key, asset in data['assets'].items():
            relative = Path(asset['filename'])
            if relative.is_absolute() or '..' in relative.parts:
                raise ValueError('Asset outside exam directory')
            target = stage / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            if asset['mime'] == 'image/png':
                page = str(asset['source_page'])
                subprocess.run(['/usr/bin/pdftoppm', '-f', page, '-l', page, '-scale-to', '2200',
                                '-singlefile', '-png', str(files['pdf']), str(target.with_suffix(''))], check=True)
                import struct
                width, height = struct.unpack('>II', target.read_bytes()[16:24])
                asset.update(width=width, height=height)
            elif asset['mime'] == 'audio/ogg':
                shutil.copyfile(files['audio'], target)
                result = subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries',
                    'format=duration', '-of', 'json', str(target)])
                asset['duration'] = float(json.loads(result)['format']['duration'])
            else:
                raise ValueError('Unsupported source asset')
            asset.update(sha256=digest(target), bytes=target.stat().st_size)
        validate_exam(data)
        for asset in data['assets'].values():
            relative = Path(asset['filename'])
            target = destination / relative
            if not target.resolve().is_relative_to(destination):
                raise ValueError('Asset symlink outside exam directory')
            target.parent.mkdir(parents=True, exist_ok=True)
            (stage / relative).replace(target)
        output = stage / 'exam.json'
        output.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
        output.replace(destination / 'exam.json')
    return data


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--manifest', type=Path, required=True)
    parser.add_argument('--destination', type=Path, required=True)
    args = parser.parse_args()
    imported = import_exam(args.source, args.destination, args.manifest)
    print(imported['id'])
