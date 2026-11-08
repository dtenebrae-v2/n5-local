"""Validate all catalogued media and create a private, self-contained APK payload."""
import argparse
import hashlib
import json
from pathlib import Path
import sys
from zipfile import ZIP_DEFLATED, ZIP_STORED, ZipFile

ROOT = Path(__file__).resolve().parents[1]


def verify_materials():
    sys.path.insert(0, str(ROOT))
    # Read catalogues without opening the mutable vocabulary store.
    from n5.library import Library
    from n5.workbooks import Workbooks
    from n5.exam_sets import ExamSets
    materials = ROOT / 'data/materials'
    library = Library(materials / 'tadoku/catalog.json', materials / 'tadoku/files')
    workbooks = Workbooks(materials)
    exams = ExamSets(materials)
    missing = []
    for book in library.books.values():
        for kind in book['assets']:
            if library.asset(book['id'], kind) is None:
                missing.append(f"tadoku/{book['id']}/{kind}")
    for label, catalog, entries in [('workbook', workbooks, workbooks.books), ('exam', exams, exams.sets)]:
        for key, (_, content, _) in entries.items():
            if content is None:
                missing.append(f'{label}/{key}/catalog')
                continue
            for asset in content['assets']:
                if catalog.asset(key, asset) is None:
                    missing.append(f'{label}/{key}/{asset}')
    if missing:
        raise ValueError('Missing or damaged materials: ' + ', '.join(missing))
    return {'books': len(library.books), 'workbooks': len(workbooks.books), 'examSets': len(exams.sets)}


def package(output):
    counts = verify_materials()
    output.mkdir(parents=True, exist_ok=True)
    files = [ROOT / 'server.py']
    files += sorted((ROOT / 'n5').glob('*.py'))
    files += sorted(p for folder in ['static', 'data'] for p in (ROOT / folder).rglob('*')
                    if p.is_file() and not any(part.startswith('.') or part == '__pycache__'
                                               for part in p.relative_to(ROOT).parts))
    temporary = output / 'content.zip.tmp'
    try:
        with ZipFile(temporary, 'w') as archive:
            for path in files:
                compressed = path.suffix.lower() not in {'.mp3', '.ogg', '.opus', '.pdf', '.png', '.jpg', '.jpeg'}
                archive.write(path, path.relative_to(ROOT).as_posix(),
                              compress_type=ZIP_DEFLATED if compressed else ZIP_STORED)
        with temporary.open('rb') as stream:
            digest = hashlib.file_digest(stream, 'sha256').hexdigest()
        temporary.replace(output / 'content.zip')
        manifest = counts | {'sha256': digest, 'files': len(files),
                             'unpackedBytes': sum(p.stat().st_size for p in files)}
        (output / 'content.json').write_text(json.dumps(manifest), encoding='utf-8')
        print(json.dumps(manifest, ensure_ascii=False))
    finally:
        temporary.unlink(missing_ok=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    package(parser.parse_args().output)
