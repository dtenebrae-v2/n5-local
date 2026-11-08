"""Run the unmodified application on a stable, loopback-only origin."""
import os
import sys
import threading

_server = None


def start(content_root, user_root, port=8095):
    global _server
    if _server is None:
        os.environ['N5_VOCABULARY'] = os.path.join(user_root, 'vocabulary.json')
        os.environ['N5_MATERIALS_DIR'] = os.path.join(content_root, 'data', 'materials')
        sys.dont_write_bytecode = True
        sys.path.insert(0, content_root)
        from http.server import ThreadingHTTPServer
        from server import Handler
        _server = ThreadingHTTPServer(('127.0.0.1', port), Handler)
        _server.daemon_threads = True
        threading.Thread(target=_server.serve_forever, daemon=True, name='n5-http').start()
    return f'http://127.0.0.1:{_server.server_port}'
