"""Restore a reviewed workbook's media from its original local source files."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from n5.workbooks import validate_workbook


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def inside(root, relative):
    path = (root / relative).resolve()
    if not path.is_relative_to(root):
        raise ValueError('Workbook path outside its directory')
    return path


def restore(source, manifest, destination):
    source, destination = Path(source).resolve(), Path(destination).resolve()
    data = validate_workbook(json.loads(Path(manifest).read_text(encoding='utf-8')))
    originals = {}
    for key, spec in data['sources'].items():
        path = inside(source, spec['filename'])
        if not path.is_file() or digest(path) != spec['sha256']:
            raise ValueError(f'Source checksum mismatch: {key}')
        originals[key] = path
    from PIL import Image
    destination.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='workbook-import-', dir=destination) as folder:
        stage, rendered = Path(folder), {}
        for key, asset in data['assets'].items():
            target = inside(stage, asset['filename'])
            target.parent.mkdir(parents=True, exist_ok=True)
            original = originals[asset['source']]
            if asset['mime'] == 'audio/mpeg':
                shutil.copyfile(original, target)
            else:
                page = asset.get('source_page')
                if page is not None:
                    if type(page) is not int or page < 1:
                        raise ValueError('Invalid source page')
                    stamp = (asset['source'], page)
                    if stamp not in rendered:
                        image = stage / f'source-{len(rendered)}.png'
                        renderer = '/usr/bin/pdftoppm' if Path('/usr/bin/pdftoppm').is_file() else 'pdftoppm'
                        subprocess.run([renderer, '-f', str(page), '-l', str(page),
                                        '-scale-to', '2200', '-singlefile', '-png',
                                        str(original), str(image.with_suffix(''))], check=True,
                                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                        rendered[stamp] = image
                    original = rendered[stamp]
                box = asset['crop']
                if (len(box) != 4 or any(type(v) not in {int, float} for v in box)
                        or not 0 <= box[0] < box[2] <= 1 or not 0 <= box[1] < box[3] <= 1):
                    raise ValueError('Invalid crop')
                with Image.open(original) as image:
                    coordinates = tuple(round(v * image.size[i % 2]) for i, v in enumerate(box))
                    image.convert('RGB').crop(coordinates).save(target, optimize=True)
            if digest(target) != asset['sha256']:
                raise ValueError(f'Restored asset checksum mismatch: {key}')
        # Validate every source and generated file before replacing installed media.
        for asset in data['assets'].values():
            target = inside(destination, asset['filename'])
            target.parent.mkdir(parents=True, exist_ok=True)
            (stage / asset['filename']).replace(target)
        catalog = stage / 'workbook.json'
        catalog.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        catalog.replace(destination / 'workbook.json')
    return data


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--manifest', type=Path, required=True)
    parser.add_argument('--destination', type=Path, required=True)
    args = parser.parse_args()
    print(restore(args.source, args.manifest, args.destination)['id'])
