"""Portable desktop launcher: loopback server and the user's default browser."""
import argparse
import hashlib
import json
import os
from pathlib import Path
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
    # Frozen Linux applications inherit bundled library paths. External browsers
    # must use their own system libraries, not PyInstaller's copies.
    previous = os.environ.get('LD_LIBRARY_PATH')
    if getattr(sys, 'frozen', False) and sys.platform.startswith('linux'):
        original = os.environ.get('LD_LIBRARY_PATH_ORIG')
        if original is None:
            os.environ.pop('LD_LIBRARY_PATH', None)
        else:
            os.environ['LD_LIBRARY_PATH'] = original
    try:
        webbrowser.open(origin + '/jlpt/n5')
    finally:
        if previous is None:
            os.environ.pop('LD_LIBRARY_PATH', None)
        else:
            os.environ['LD_LIBRARY_PATH'] = previous


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
