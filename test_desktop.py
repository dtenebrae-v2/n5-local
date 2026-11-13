import base64
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
import unittest
from unittest.mock import patch
from urllib.request import ProxyHandler, build_opener

import desktop
from scripts.prepare_android_signing import prepare

ROOT = Path(__file__).parent


class DesktopTests(unittest.TestCase):
    def test_user_profile_paths_and_stable_identity(self):
        with patch.object(desktop.sys, 'platform', 'linux'), patch.dict(os.environ, {'XDG_DATA_HOME': '/tmp/n5-profile'}):
            self.assertEqual(desktop.profile_directory(), Path('/tmp/n5-profile/n5-local'))
        with patch.object(desktop.sys, 'platform', 'win32'), patch.dict(os.environ, {'LOCALAPPDATA': '/tmp/n5-windows'}):
            self.assertEqual(desktop.profile_directory(), Path('/tmp/n5-windows/N5Local'))
        self.assertEqual(desktop.profile_identity(ROOT), desktop.profile_identity(ROOT / '.'))
        self.assertNotEqual(desktop.profile_identity(ROOT), desktop.profile_identity(ROOT / 'other'))

    def test_source_launcher_reuses_only_the_same_profile_and_preserves_vocabulary(self):
        with tempfile.TemporaryDirectory() as temporary:
            profile = Path(temporary)
            command = [sys.executable, str(ROOT / 'desktop.py'), '--no-browser', '--port', '0', '--data-dir', str(profile)]
            process = subprocess.Popen(command, cwd=temporary, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding='utf-8')
            timer = threading.Timer(20, process.kill); timer.start()
            try:
                origin = process.stdout.readline().strip(); timer.cancel()
                self.assertTrue(origin.startswith('http://127.0.0.1:'))
                opener = build_opener(ProxyHandler({}))
                with opener.open(origin + '/api/health', timeout=5) as response:
                    self.assertEqual(json.load(response)['status'], 'ok')
                vocabulary = (profile / 'vocabulary.json').read_bytes()
                same = command.copy();same[same.index('--port')+1] = origin.rsplit(':', 1)[1]
                second = subprocess.run(same, capture_output=True, text=True, timeout=10)
                self.assertEqual(second.returncode, 0, second.stderr)
                self.assertEqual(second.stdout.strip(), origin)
                self.assertEqual((profile / 'vocabulary.json').read_bytes(), vocabulary)
                other = same.copy();other[-1] = str(profile / 'other')
                busy = subprocess.run(other, capture_output=True, text=True, timeout=10)
                self.assertNotEqual(busy.returncode, 0)
                self.assertIn('Cannot start N5 Local', busy.stderr)
                self.assertEqual((profile / 'vocabulary.json').read_bytes(), vocabulary)
            finally:
                timer.cancel();process.terminate();process.wait(timeout=10)
                process.stdout.close();process.stderr.close()

    def test_signing_key_stays_in_runner_temporary_storage(self):
        with tempfile.TemporaryDirectory() as temporary:
            env = {'N5_KEYSTORE_BASE64': base64.b64encode(b'private fixture').decode(),
                   'N5_STORE_PASSWORD': 'password', 'N5_KEY_ALIAS': 'alias', 'N5_KEY_PASSWORD': 'password',
                   'RUNNER_TEMP': temporary, 'GITHUB_ENV': str(Path(temporary) / 'environment'), 'GITHUB_REF_NAME': 'v1.2.3'}
            with patch('time.time', return_value=1794000000):
                path = prepare(env)
            self.assertEqual(path.read_bytes(), b'private fixture')
            exported = Path(env['GITHUB_ENV']).read_text(encoding='utf-8')
            self.assertIn('N5_VERSION_CODE=1794000000', exported)
            self.assertIn('N5_VERSION_NAME=v1.2.3', exported)
            self.assertNotIn('password', exported)
            env.pop('N5_KEY_PASSWORD')
            with self.assertRaisesRegex(ValueError, 'N5_KEY_PASSWORD'):
                prepare(env)
