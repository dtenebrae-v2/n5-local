"""Coverage and provenance of the locally imported intensive exercise set."""
import copy
import hashlib
import json
from pathlib import Path
import tempfile
import unittest

from n5.workbooks import Workbooks, validate_workbook
from scripts.import_workbook import restore

ROOT = Path(__file__).parent
DIRECTORY = ROOT / 'data/materials/intensive-n5'


class IntensiveTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = json.loads((DIRECTORY / 'workbook.json').read_text(encoding='utf-8'))

    def test_question_coverage_unique_tracks_and_verified_keys(self):
        data = validate_workbook(self.data)
        self.assertEqual(len(data['items']), 110)
        listening = [q for q in data['items'] if q['kind'] == 'listening']
        self.assertEqual(len(listening), 24)
        self.assertEqual({q['audio'] for q in listening}, {f'Track{n:03}' for n in range(56, 80)})
        self.assertEqual([q['id'] for q in listening if q['correct'] is None],
                         [f'listening-{n}' for n in range(56, 63)])
        for q in listening:
            if q['correct'] is not None:
                self.assertEqual(q['answer_source']['kind'], 'printed-key')
                self.assertTrue(q['spoken_prompt'])
                self.assertTrue(q['transcript_images'])
                self.assertTrue(q['explanation'])
                self.assertIn(q['answer_source']['source'], data['sources'])
        self.assertEqual(data['coverage']['missing'][0]['numbers'], list(range(21, 27)))
        self.assertEqual(data['coverage']['reused'][0]['questions'], 32)
        # Ambiguous questions must not penalize a linguistically valid choice.
        ambiguous = next(q for q in data['items'] if q['id'] == 'vocab-b-context-29')
        self.assertIsNone(ambiguous['correct'])
        self.assertEqual(ambiguous['answer_source']['kind'], 'ambiguous-source')

    def test_assets_are_complete_and_every_asset_has_a_use(self):
        books = Workbooks(ROOT / 'data/materials')
        self.assertEqual(books.public('intensive-n5')['title'], 'Интенсив N5')
        used = set()
        for q in self.data['items']:
            for field in ('images', 'choice_images', 'transcript_images'):
                used.update(q.get(field, []))
            if q.get('audio'):
                used.add(q['audio'])
        self.assertEqual(used, set(self.data['assets']))
        for key, asset in self.data['assets'].items():
            self.assertIn(asset['source'], self.data['sources'])
            self.assertEqual(hashlib.sha256((DIRECTORY / asset['filename']).read_bytes()).hexdigest(), asset['sha256'])
            self.assertIsNotNone(books.asset('intensive-n5', key))

    def test_star_can_be_in_second_position_and_links_are_local(self):
        question = next(q for q in self.data['items'] if q['id'] == 'grammar-2024-10')
        self.assertEqual(question['star_position'], 1)
        self.assertEqual(question['order'], [4, 1, 3, 2])
        self.assertEqual(question['correct'], 0)
        for change in ('star', 'group', 'link', 'transcript'):
            data = copy.deepcopy(self.data)
            if change == 'star':
                next(q for q in data['items'] if q['id'] == question['id'])['star_position'] = 5
            if change == 'group':
                data['units'][0]['group'] = 'unknown'
            if change == 'link':
                next(u for u in data['units'] if u['id'] == 'existing-grammar-reading')['href'] = 'javascript:alert(1)'
            if change == 'transcript':
                data['items'][-1]['transcript_images'] = ['Track079']
            with self.subTest(change=change), self.assertRaises(ValueError):
                validate_workbook(data)

    def test_import_refuses_changed_source_before_replacing_assets(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            source = root / 'source'; source.mkdir()
            (source / 'recording.mp3').write_bytes(b'changed')
            manifest = root / 'workbook.json'
            data = copy.deepcopy(self.data)
            data['sources'] = {'fixture': {'filename':'recording.mp3', 'sha256':'0' * 64}}
            manifest.write_text(json.dumps(data), encoding='utf-8')
            target = root / 'installed'; target.mkdir()
            old = target / 'workbook.json'; old.write_text('existing')
            with self.assertRaisesRegex(ValueError, 'Source checksum mismatch'):
                restore(source, manifest, target)
            self.assertEqual(old.read_text(), 'existing')
