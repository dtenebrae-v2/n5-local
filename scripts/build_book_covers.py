"""Render the original first PDF page as a small catalogue image (build-time only)."""
import argparse
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]

def build(output, renderer):
    output.mkdir(parents=True, exist_ok=True)
    books = json.loads((ROOT / 'data/materials/tadoku/catalog.json').read_text())['books']
    with tempfile.TemporaryDirectory(prefix='n5-covers-') as folder:
        for book in books:
            source = ROOT / 'data/materials/tadoku/files' / book['assets']['pdf']['filename']
            target = Path(folder) / book['id']
            subprocess.run([renderer, '-f', '1', '-singlefile', '-scale-to', '480', '-png', str(source), str(target)], check=True, capture_output=True)
            with Image.open(target.with_suffix('.png')) as image:
                image.convert('RGB').save(output / f"{book['id']}.webp", 'WEBP', quality=82, method=6)
    print(f'{len(books)} original first-page covers written to {output}')

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT / 'static/book-covers')
    parser.add_argument('--renderer', default='/usr/bin/pdftoppm' if Path('/usr/bin/pdftoppm').is_file() else shutil.which('pdftoppm'))
    args = parser.parse_args()
    if not args.renderer:
        parser.error('Install Poppler (pdftoppm) to regenerate covers')
    build(args.output, args.renderer)
