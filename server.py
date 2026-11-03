"""Offline N5 HTTP server; Python standard library only."""
import json
import os
import re
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

from n5.grammar_practice import load_grammar
from n5.counters import load_counters
from n5.mock_exam import load_mock_exam
from n5.library import Library, byte_range
from n5.export import vocabulary_csv
from n5.store import VocabularyStore, WordError
from n5.vocabulary import unique_keys

ROOT = Path(__file__).resolve().parent
DATA = ROOT / 'data'
COUNTERS = load_counters(DATA / 'counters.json')
GRAMMAR_PRACTICE = load_grammar(DATA / 'grammar-practice.json')
MOCK_EXAM = load_mock_exam(DATA / 'mock-exam.json')
LIBRARY = Library(DATA / 'library.json', Path(os.environ.get('N5_LIBRARY_DIR', DATA / 'library-files')))
STORE = VocabularyStore(DATA, Path(os.environ.get('N5_VOCABULARY', DATA / 'vocabulary.json')))
CATALOG = STORE.catalog
REPOSITORY = CATALOG.repository
ASSETS = {
    '/style.css': (ROOT / 'static/style.css', 'text/css; charset=utf-8'),
    '/favicon.svg': (ROOT / 'static/favicon.svg', 'image/svg+xml'),
}
# Serve only known static files; arbitrary request paths never become filesystem paths.
ASSETS.update({
    '/' + path.relative_to(ROOT / 'static').as_posix(): (path, {
        '.js':'text/javascript; charset=utf-8', '.mjs':'text/javascript; charset=utf-8',
        '.ttf':'font/ttf', '.txt':'text/plain; charset=utf-8',
    }.get(path.suffix, 'application/octet-stream'))
    for path in (ROOT / 'static').rglob('*')
    if path.is_file() and path.suffix in {'.js','.mjs','.bcmap','.pfb','.ttf','.txt'}
})

CSP = (
    "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; "
    "connect-src 'self'; frame-ancestors 'none'; base-uri 'none'"
)


class Handler(BaseHTTPRequestHandler):
    def send(self, body, content_type='application/json; charset=utf-8', status=200, extra=None):
        if isinstance(body, (dict, list)):
            body = json.dumps(body, ensure_ascii=False).encode()
        elif isinstance(body, str):
            body = body.encode()
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Content-Security-Policy', CSP)
        self.send_header('Cache-Control', 'no-cache')
        for key, value in (extra or {}).items():
            self.send_header(key, value)
        self.end_headers()
        if self.command != 'HEAD':
            self.wfile.write(body)

    def do_HEAD(self):
        self.do_GET()

    def do_GET(self):
        url = urlsplit(self.path)
        path = url.path.rstrip('/') or '/'
        params = parse_qs(url.query)
        try:
            media = re.fullmatch(r'/library-files/(\d+)/(pdf|print|audio)',path)
            reader = re.fullmatch(r'/jlpt/n5/library/(\d+)',path)
            if media:
                self.serve_library_file(*media.groups(), attachment=params.get('download')==['1'])
            elif reader and reader.group(1) in LIBRARY.books:
                self.send((ROOT / 'static/index.html').read_bytes(), 'text/html; charset=utf-8')
            elif path.startswith('/api/'):
                self.serve_api(path, params)
            elif path in ASSETS:
                filename, mime = ASSETS[path]
                self.send(filename.read_bytes(), mime)
            elif path in STORE.catalog.routes:
                self.send((ROOT / 'static/index.html').read_bytes(), 'text/html; charset=utf-8')
            else:
                self.not_found()
        except ValueError:
            self.send({'error': 'Некорректные параметры запроса'}, status=400)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def do_POST(self):
        if urlsplit(self.path).path.rstrip('/') != '/api/words':
            return self.not_found()
        origin = self.headers.get('Origin')
        if origin and urlsplit(origin).netloc != self.headers.get('Host'):
            return self.send({'error': 'Запрос должен быть отправлен со страницы словаря.'}, status=403)
        if self.headers.get('Content-Type', '').split(';')[0].strip() != 'application/json':
            return self.send({'error': 'Ожидается JSON.'}, status=415)
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= 32768:
                return self.send({'error': 'Недопустимый размер запроса.'}, status=413)
            self.connection.settimeout(10)
            payload = json.loads(self.rfile.read(length).decode('utf-8'), object_pairs_hook=unique_keys)
            self.send(STORE.add(payload), status=201)
        except WordError as error:
            self.send({'error': str(error)}, status=error.status)
        except (ValueError, UnicodeError):
            self.send({'error': 'Некорректные данные формы.'}, status=400)
        except OSError:
            self.send({'error': 'Не удалось сохранить слово. Проверьте доступ к файлу словаря.'}, status=500)

    def serve_api(self, path, params):
        catalog = STORE.catalog
        repository = catalog.repository
        if path == '/api/health':
            return self.send({'status': 'ok', 'entries': repository.count()})
        if path == '/api/library':
            return self.send(LIBRARY.public())
        if path == '/api/counters':
            return self.send(COUNTERS)
        if path == '/api/mock-exam':
            return self.send(MOCK_EXAM)
        if path == '/api/grammar-practice':
            return self.send(GRAMMAR_PRACTICE)
        if path == '/api/catalog':
            return self.send(catalog.public)
        if path == '/api/groups':
            return self.send(repository.groups(params.get('collection', [None])[0]))
        if path == '/api/training-words':
            return self.send({'entries': repository.training_words()})
        if path == '/api/words':
            return self.send(repository.words(params))
        if path == '/api/export.csv':
            return self.send(
                vocabulary_csv(repository.words(params, paginate=False)),
                'text/csv; charset=utf-8',
                extra={'Content-Disposition': 'attachment; filename="n5-vocabulary.csv"'},
            )
        if path == '/api/lessons':
            return self.send([
                {key: value for key, value in lesson.items() if key != 'html'}
                for lesson in catalog.lessons.values()
            ])
        if path == '/api/lesson':
            lesson = catalog.lessons.get(params.get('path', [''])[0])
            return self.send(lesson) if lesson else self.not_found()
        self.not_found()

    def serve_library_file(self,bid,kind,attachment=False):
        found=LIBRARY.asset(bid,kind)
        if not found:
            return self.not_found()
        path,asset=found
        size=path.stat().st_size
        etag='"'+asset['sha256']+'"'
        requested=self.headers.get('Range')
        if self.headers.get('If-Range') not in {None,etag}:
            requested=None
        if not requested and self.headers.get('If-None-Match')==etag:
            return self.send(b'', status=304, extra={'ETag':etag})
        try:
            start,end,partial=byte_range(requested,size)
        except ValueError:
            return self.send(b'', status=416, extra={'Content-Range':f'bytes */{size}'})
        self.send_response(206 if partial else 200)
        self.send_header('Content-Type','audio/mpeg' if kind=='audio' else 'application/pdf')
        self.send_header('Content-Length',str(end-start+1))
        self.send_header('Accept-Ranges','bytes')
        self.send_header('ETag',etag)
        self.send_header('Cache-Control','private, max-age=3600')
        self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('Content-Disposition',f'{"attachment" if attachment else "inline"}; filename="{asset["filename"]}"')
        if partial:
            self.send_header('Content-Range',f'bytes {start}-{end}/{size}')
        self.end_headers()
        if self.command=='HEAD':
            return
        with path.open('rb') as stream:
            stream.seek(start)
            remaining=end-start+1
            while remaining:
                chunk=stream.read(min(65536,remaining))
                if not chunk:break
                self.wfile.write(chunk)
                remaining-=len(chunk)

    def not_found(self):
        self.send({'error': 'Страница не найдена'}, status=404)


def main():
    host = os.environ.get('HOST', '127.0.0.1')
    port = int(os.environ.get('PORT', '8095'))
    with ThreadingHTTPServer((host, port), Handler) as server:
        print(f'N5 Local: http://{host}:{port}', flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == '__main__':
    main()
