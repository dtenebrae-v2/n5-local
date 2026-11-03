import copy
import json
from pathlib import Path
import tempfile
import unittest
from n5.counters import load_counters


class CounterTests(unittest.TestCase):
    def test_catalog_and_rejected_bad_data(self):
        data = load_counters(Path('data/counters.json'))
        self.assertEqual(len(data['counters']), 17)
        for mutation in ('duplicate', 'romaji', 'missing'):
            broken = copy.deepcopy(data)
            if mutation == 'duplicate':
                broken['counters'].append(broken['counters'][0])
            elif mutation == 'romaji':
                broken['counters'][0]['forms'][0]['readings'] = ['issai']
            else:
                del broken['counters'][0]['rule']
            with tempfile.TemporaryDirectory() as directory:
                path = Path(directory) / 'counters.json'
                path.write_text(json.dumps(broken))
                with self.assertRaises(ValueError):
                    load_counters(path)
