"""Portable desktop launcher: loopback server and the user's default browser."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import threading
from urllib.request import ProxyHandler, build_opener
import webbrowser


def profile_directory():
    if sys.platform == 'win32':
        return Path(os.environ.get('LOCALAPPDATA') or Path.home() / 'AppData/Local') / 'N5Local'
    return Path(os.environ.get('XDG_DATA_HOME') or Path.home() / '.local/share') / 'n5-local'


def profile_identity(directory):
    return hashlib.sha256(str(directory.resolve()).encode()).hexdigest()[:24]


def existing_instance(origin, identity):
    try:
        opener = build_opener(ProxyHandler({}))
        with opener.open(origin + '/api/desktop', timeout=2) as response:
            return json.load(response) == {'application': 'n5-local', 'profile': identity}
    except (OSError, ValueError):
        return False


def open_browser(origin):
    url = origin + '/jlpt/n5'
    if not sys.platform.startswith('linux'):
        webbrowser.open(url)
        return
    # Frozen Linux applications inherit bundled library paths. External browsers
    # must use their own system libraries, not PyInstaller's copies.
    environment = os.environ.copy()
    if getattr(sys, 'frozen', False):
        original = os.environ.get('LD_LIBRARY_PATH_ORIG')
        if original is None:
            environment.pop('LD_LIBRARY_PATH', None)
        else:
            environment['LD_LIBRARY_PATH'] = original
    # Browser diagnostics (including Chromium's existing-session handoff) belong
    # to the browser, not the local server's console. Never redirect server FDs:
    # this function also runs in a thread while the server handles requests.
    try:
        subprocess.Popen(['xdg-open', url], env=environment,
                         stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                         stderr=subprocess.DEVNULL, start_new_session=True)
    except OSError:
        print(f'Не удалось открыть браузер. Откройте {url} вручную.', file=sys.stderr, flush=True)


def main():
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, 'reconfigure'):
            stream.reconfigure(encoding='utf-8')
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8095)
    parser.add_argument('--data-dir', type=Path, default=profile_directory())
    parser.add_argument('--no-browser', action='store_true')
    args = parser.parse_args()
    if not 0 <= args.port <= 65535:
        parser.error('Port must be between 0 and 65535')
    directory = args.data_dir.expanduser().resolve()
    directory.mkdir(parents=True, exist_ok=True)
    identity = profile_identity(directory)
    origin = f'http://127.0.0.1:{args.port}'
    # A fixed origin preserves the browser's progress between launches/updates.
    if args.port and existing_instance(origin, identity):
        print(origin, flush=True)
        if not args.no_browser:
            open_browser(origin)
        return
    os.environ['N5_VOCABULARY'] = str(directory / 'vocabulary.json')
    os.environ['N5_MATERIALS_DIR'] = str(Path(__file__).resolve().parent / 'data/materials')
    sys.dont_write_bytecode = True
    from http.server import ThreadingHTTPServer
    from server import Handler

    class DesktopHandler(Handler):
        def do_GET(self):
            if self.path == '/api/desktop':
                self.send({'application': 'n5-local', 'profile': identity})
            else:
                super().do_GET()

        def log_message(self, format, *values):
            pass

    try:
        server = ThreadingHTTPServer(('127.0.0.1', args.port), DesktopHandler)
    except OSError as error:
        parser.exit(1, f'Cannot start N5 Local on {origin}: {error}\n'
                    'Close the other application using this port or select --port.\n')
    server.daemon_threads = True
    origin = f'http://127.0.0.1:{server.server_port}'
    print(origin, flush=True)
    print('N5 Local: оставьте это окно открытым. Для выхода нажмите Ctrl+C.', flush=True)
    if not args.no_browser:
        timer = threading.Timer(.2, open_browser, args=(origin,))
        timer.daemon = True
        timer.start()
    with server:
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == '__main__':
    main()
