"""Offline N5 HTTP server; Python standard library only."""
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

from n5.grammar_practice import load_grammar
from n5.export import vocabulary_csv
from n5.store import VocabularyStore, WordError
from n5.vocabulary import unique_keys

ROOT = Path(__file__).resolve().parent
DATA = ROOT / 'data'
GRAMMAR_PRACTICE = load_grammar(DATA / 'grammar-practice.json')
STORE = VocabularyStore(DATA, Path(os.environ.get('N5_VOCABULARY', DATA / 'vocabulary.json')))
CATALOG = STORE.catalog
REPOSITORY = CATALOG.repository
ASSETS = {
    '/style.css': (ROOT / 'static/style.css', 'text/css; charset=utf-8'),
    '/favicon.svg': (ROOT / 'static/favicon.svg', 'image/svg+xml'),
}
# Serve only known static files; arbitrary request paths never become filesystem paths.
ASSETS.update({
    '/' + path.relative_to(ROOT / 'static').as_posix(): (path, 'text/javascript; charset=utf-8')
    for path in (ROOT / 'static').rglob('*.js')
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
            if path.startswith('/api/'):
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
        if path == '/api/grammar-practice':
            return self.send(GRAMMAR_PRACTICE)
        if path == '/api/catalog':
            return self.send(catalog.public)
        if path == '/api/groups':
            return self.send(repository.groups(params.get('collection', [None])[0]))
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
