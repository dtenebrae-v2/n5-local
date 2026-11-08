"""Checks for the manual release environment and private offline artifacts."""
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from zipfile import ZipFile

SPEC = importlib.util.spec_from_file_location('release', Path(__file__).parent / 'scripts/release.py')
release = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(release)


class ReleaseTests(unittest.TestCase):
    def test_explicit_tools_take_precedence_over_local_defaults(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / '.build-tools/jdk').mkdir(parents=True)
            with patch.object(release, 'ROOT', root), patch.dict(release.os.environ, {'JAVA_HOME': '/custom/jdk'}):
                self.assertEqual(release.build_environment()['JAVA_HOME'], '/custom/jdk')

    def test_apk_with_wrong_payload_is_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            metadata = {'sha256': hashlib.sha256(b'correct').hexdigest()}
            (root / 'content.json').write_text(json.dumps(metadata))
            apk = root / 'app.apk'
            with ZipFile(apk, 'w') as archive:
                archive.writestr('assets/content.json', json.dumps(metadata))
                archive.writestr('assets/content.zip', b'incorrect')
            with self.assertRaises(AssertionError):
                release.verify_apk(apk, root)

    def test_material_changes_invalidate_success_fingerprint(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            media = root / 'data/materials/private'
            media.mkdir(parents=True)
            with patch.object(release, 'ROOT', root), patch.object(release, 'run', return_value=''):
                before = release.fingerprint()
                (media / 'book.pdf').write_bytes(b'private book')
                self.assertNotEqual(release.fingerprint(), before)


if __name__ == '__main__':
    unittest.main()
