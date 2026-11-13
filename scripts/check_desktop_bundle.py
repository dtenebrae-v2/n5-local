"""Extract and launch a desktop release, then exercise all catalogued media."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tarfile
import tempfile
import threading
from urllib.request import ProxyHandler, Request, build_opener
from zipfile import ZipFile


def check(archive):
    archive = archive.resolve()
    expected = archive.with_name(archive.name + '.sha256').read_text(encoding='utf-8').split()[0]
    with archive.open('rb') as stream:
        assert hashlib.file_digest(stream, 'sha256').hexdigest() == expected
    with tempfile.TemporaryDirectory(prefix='n5-desktop-check-') as temporary:
        folder = Path(temporary)
        if archive.suffix == '.zip':
            with ZipFile(archive) as stream:
                assert all(not Path(p).is_absolute() and '..' not in Path(p).parts for p in stream.namelist())
                stream.extractall(folder)
        else:
            with tarfile.open(archive) as stream:
                stream.extractall(folder, filter='data')
        executable = folder / 'n5-local' / ('n5-local.exe' if sys.platform == 'win32' else 'n5-local')
        bundled_vocabulary = folder / 'n5-local/_internal/data/vocabulary.json'
        original_vocabulary = bundled_vocabulary.read_bytes()
        profile = folder / 'user'
        command = [str(executable), '--no-browser', '--port', '0', '--data-dir', str(profile)]
        process = subprocess.Popen(command, cwd=folder, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding='utf-8')
        # Bound startup even when an executable exits before printing its origin.
        timer = threading.Timer(90, process.kill)
        timer.start()
        try:
            origin = process.stdout.readline().strip()
            timer.cancel()
            assert origin.startswith('http://127.0.0.1:'), origin + process.stdout.read() if process.poll() is not None else origin
            opener = build_opener(ProxyHandler({}))

            def get(path):
                with opener.open(origin + path, timeout=30) as response:
                    return json.load(response)

            def media(path):
                with opener.open(Request(origin + path, headers={'Range': 'bytes=0-63'}), timeout=30) as response:
                    assert response.status == 206 and len(response.read()) == 64

            assert get('/api/health')['status'] == 'ok'
            assert get('/api/desktop')['application'] == 'n5-local'
            media_count = 0
            books = get('/api/library')['books']
            assert len(books) == 44
            for book in books:
                for asset in book['assets'].values():
                    assert asset['available']
                    media(asset['local_url']); media_count += 1
            for kind, key in [('workbooks', 'books'), ('exams', 'sets')]:
                for item in get('/api/' + kind)[key]:
                    assert item['available']
                    detail = get('/api/' + ('workbook' if kind == 'workbooks' else 'exam') + '?id=' + item['id'])
                    for asset in detail['assets'].values():
                        assert asset['available']
                        media(asset['url']); media_count += 1
            with opener.open(origin + '/jlpt/n5') as response:
                assert b'id="content"' in response.read()
            assert (profile / 'vocabulary.json').is_file()
            # A second launch of the same profile reuses its fixed origin.
            second = subprocess.run([str(executable), '--no-browser', '--port', origin.rsplit(':', 1)[1],
                                     '--data-dir', str(profile)], cwd=folder, capture_output=True, text=True, encoding='utf-8', timeout=15)
            assert second.returncode == 0 and second.stdout.strip() == origin, second.stderr
            word = {'kanji': '試験保存語', 'readings': [{'kana': 'しけんほぞんご', 'romaji': 'shikenhozongo'}],
                    'meanings': ['desktop persistence fixture'], 'collection': 'nouns', 'group': 'nouns:study'}
            with opener.open(Request(origin + '/api/words', data=json.dumps(word).encode('utf-8'),
                                     headers={'Content-Type': 'application/json'}, method='POST'), timeout=15) as response:
                assert response.status == 201
            process.terminate(); process.wait(timeout=15); process.stdout.close()
            process = subprocess.Popen(command, cwd=folder, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding='utf-8')
            timer = threading.Timer(90, process.kill); timer.start()
            origin = process.stdout.readline().strip(); timer.cancel()
            assert origin.startswith('http://127.0.0.1:')
            assert get('/api/words?collection=nouns&q=shikenhozongo')['total'] == 1
            assert bundled_vocabulary.read_bytes() == original_vocabulary
            print(f'PASS desktop archive: startup, separate profile, second launch, saved word after restart, {media_count} media ranges')
        finally:
            timer.cancel()
            process.terminate()
            process.wait(timeout=15)
            process.stdout.close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('archive', type=Path)
    check(parser.parse_args().archive)
