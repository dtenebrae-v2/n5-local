import copy
import json
from pathlib import Path
import tempfile
import unittest

from n5.mock_exam import load_mock_exam


class MockExamTests(unittest.TestCase):
    def test_bundled_bank(self):
        data = load_mock_exam(Path(__file__).parent / 'data/mock-exam.json')
        self.assertGreaterEqual(len(data['items']), 1200)
        for topic in data['topics']:
            self.assertGreaterEqual(len({q['family'] for q in data['items'] if q['topic'] == topic['id']}), 24, topic['id'])
        self.assertTrue(all(q.get('topic') for q in data['items']))
        self.assertGreaterEqual(len([p for p in data['passages'] if not p['id'].startswith('text:')]), 30)
        self.assertGreaterEqual(len(data['topics']), 40)
        self.assertTrue({'kana','copula','conversation'} <= {t['id'] for t in data['topics']})
        self.assertEqual(set(data['coverage']['topics']),{t['id'] for t in data['topics']})
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

    def test_coverage_rejects_removed_topics_and_insufficient_examples(self):
        original = load_mock_exam(Path(__file__).parent / 'data/mock-exam.json')
        for missing_topic in (False, True):
            broken = copy.deepcopy(original)
            if missing_topic:
                broken['coverage']['topics'].pop()
            else:
                # Keep the topic nonempty but take it below the independent-example minimum.
                broken['items'] = [q for q in broken['items'] if q['id'] != 'n5plus:kana:1']
            with tempfile.TemporaryDirectory() as folder:
                path = Path(folder) / 'mock.json'
                path.write_text(json.dumps(broken), encoding='utf-8')
                with self.assertRaises(ValueError):
                    load_mock_exam(path)
