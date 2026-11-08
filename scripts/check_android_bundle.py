"""Smoke-test the packaged offline application on the build machine."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
from urllib.request import Request, build_opener, ProxyHandler
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]


def check(assets):
    manifest = json.loads((assets / 'content.json').read_text())
    with (assets / 'content.zip').open('rb') as stream:
        assert hashlib.file_digest(stream, 'sha256').hexdigest() == manifest['sha256']
    with tempfile.TemporaryDirectory(prefix='n5-android-check-') as temporary:
        content = Path(temporary) / 'content'
        with ZipFile(assets / 'content.zip') as archive:
            assert len(archive.infolist()) == manifest['files']
            assert sum(item.file_size for item in archive.infolist()) == manifest['unpackedBytes']
            for item in archive.infolist():
                assert not Path(item.filename).is_absolute() and '..' not in Path(item.filename).parts
            archive.extractall(content)
        user = Path(temporary) / 'user'
        user.mkdir()
        spec = importlib.util.spec_from_file_location('android_bootstrap', ROOT / 'android/app/src/main/python/bootstrap.py')
        bootstrap = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(bootstrap)
        origin = bootstrap.start(str(content), str(user), 0)
        opener = build_opener(ProxyHandler({}))

        def get(path):
            with opener.open(origin + path, timeout=30) as response:
                return json.load(response)

        def media(path):
            with opener.open(Request(origin + path, headers={'Range': 'bytes=0-63'}), timeout=30) as response:
                assert response.status == 206
                assert len(response.read()) == 64

        try:
            assert get('/api/health')['status'] == 'ok'
            library = get('/api/library')['books']
            assert len(library) == manifest['books']
            media_count = 0
            for book in library:
                for asset in book['assets'].values():
                    assert asset['available']
                    media(asset['local_url'])
                    media_count += 1
            for kind, key, expected in [('workbooks', 'books', manifest['workbooks']), ('exams', 'sets', manifest['examSets'])]:
                catalog = get('/api/' + kind)[key]
                assert len(catalog) == expected and all(item['available'] for item in catalog)
                for item in catalog:
                    detail = get('/api/' + ('workbook' if kind == 'workbooks' else 'exam') + '?id=' + item['id'])
                    for asset in detail['assets'].values():
                        assert asset['available']
                        media(asset['url'])
                        media_count += 1
            with opener.open(origin + '/jlpt/n5') as response:
                assert b'id="content"' in response.read()
            assert (user / 'vocabulary.json').is_file()
            assert bootstrap.start(str(content), str(user), 0) == origin
            print(f'PASS: isolated payload startup, {media_count} media range requests, all catalogues, persistent vocabulary and repeat startup')
        finally:
            bootstrap._server.shutdown()
            bootstrap._server.server_close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('assets', type=Path)
    check(parser.parse_args().assets)
