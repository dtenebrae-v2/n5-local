import copy
import json
from pathlib import Path
import tempfile
import unittest

from n5.mock_exam import load_mock_exam


class MockExamTests(unittest.TestCase):
    def test_bundled_bank(self):
        data = load_mock_exam(Path(__file__).parent / 'data/mock-exam.json')
        self.assertGreaterEqual(len(data['items']), 500)
        for topic in data['topics']:
            self.assertGreaterEqual(sum(q['topic'] == topic['id'] for q in data['items']), 8, topic['id'])
        self.assertTrue(all(q.get('topic') for q in data['items']))
        self.assertGreaterEqual(len([p for p in data['passages'] if not p['id'].startswith('text:')]), 30)
        self.assertGreaterEqual(len(data['topics']), 35)
        self.assertTrue(all(p.get('translation') for p in data['passages']))

    def test_invalid_answer_and_missing_passage(self):
        data = load_mock_exam(Path(__file__).parent / 'data/mock-exam.json')
        for change in ({'correct': 4}, {'passage': 'missing'}, {'choices': ['a'] * 4}, {'topic': 'missing'}, {'sources': [99]}, {'family': ''}, {'type': 'unknown'}, {'skill': 'missing'}):
            broken = copy.deepcopy(data)
            broken['items'][0].update(change)
            with tempfile.TemporaryDirectory() as folder:
                path = Path(folder) / 'mock.json'
                path.write_text(json.dumps(broken), encoding='utf-8')
                with self.assertRaises(ValueError):
                    load_mock_exam(path)
