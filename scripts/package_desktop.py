"""Build a portable desktop archive on its native OS and architecture."""
import argparse
import hashlib
from pathlib import Path
import platform
import subprocess
import sys
import tarfile
import tempfile
from zipfile import ZIP_DEFLATED, ZipFile

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from scripts.package_android import ROOT, verify_materials


def target_name():
    machine = platform.machine().lower()
    if sys.platform == 'win32' and machine in {'amd64', 'x86_64'}:
        return 'windows-x86_64'
    if sys.platform.startswith('linux'):
        if machine in {'aarch64', 'arm64'}:
            return 'linux-arm64'
        if machine in {'amd64', 'x86_64'}:
            return 'linux-x86_64'
    raise ValueError('Supported build hosts: Linux x86_64/ARM64 and Windows x86_64')


def package(output):
    target = target_name()
    verify_materials()
    output = output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='n5-desktop-') as temporary:
        folder = Path(temporary)
        subprocess.run([sys.executable, '-m', 'PyInstaller', '--noconfirm', '--clean',
                        '--onedir', '--name', 'n5-local',
                        '--distpath', str(folder / 'dist'), '--workpath', str(folder / 'work'),
                        '--specpath', str(folder),
                        '--add-data', f'{ROOT / "static"}:static',
                        '--add-data', f'{ROOT / "data"}:data',
                        str(ROOT / 'desktop.py')], cwd=ROOT, check=True)
        content = folder / 'dist/n5-local'
        name = f'n5-local-{target}'
        if target.startswith('windows'):
            archive = output / (name + '.zip')
            with ZipFile(archive, 'w', compression=ZIP_DEFLATED, compresslevel=1) as stream:
                for path in sorted(content.rglob('*')):
                    if path.is_file():
                        stream.write(path, Path('n5-local') / path.relative_to(content))
        else:
            archive = output / (name + '.tar.gz')
            with tarfile.open(archive, 'w:gz', compresslevel=1) as stream:
                stream.add(content, arcname='n5-local')
    with archive.open('rb') as stream:
        digest = hashlib.file_digest(stream, 'sha256').hexdigest()
    archive.with_name(archive.name + '.sha256').write_text(f'{digest}  {archive.name}\n', encoding='utf-8')
    print(archive, flush=True)
    return archive


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT / 'dist')
    package(parser.parse_args().output)
