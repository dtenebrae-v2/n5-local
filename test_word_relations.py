from copy import deepcopy
from pathlib import Path
import json
import tempfile
import unittest
from n5.catalog import Catalog
from n5.repository import VocabularyRepository
from n5.word_relations import load_relations, public_relations


class WordRelationTests(unittest.TestCase):
    def test_live_dictionary_and_route(self):
        catalog = Catalog(Path('data'), lambda c: VocabularyRepository(Path('data/vocabulary.json'), c))
        self.assertIn('/jlpt/n5/word-relations', catalog.routes)
        data = load_relations(Path('data/word-relations.json'))
        public = public_relations(data, catalog.repository.training_words())
        self.assertEqual(public['unavailable'], 0)
        self.assertEqual(len(public['relations']), 76)
        entries = catalog.repository.training_words()
        for word in entries:
            if word['id'] == 5:
                word['readings'] = [{'kana': 'べつ', 'romaji': 'betsu'}]
        changed = public_relations(data, entries)
        self.assertGreater(changed['unavailable'], 0)
        self.assertFalse(any(5 in (r['left']['word_id'], r['right']['word_id']) for r in changed['relations']))
        self.assertEqual(len(data['relations']), 76)

    def test_reject_invalid_kind_duplicates_and_bad_readings(self):
        data = load_relations(Path('data/word-relations.json'))
        for mutation in ('kind','duplicate','reading'):
            broken = deepcopy(data)
            if mutation == 'kind': broken['relations'][0]['kind'] = 'equal'
            elif mutation == 'duplicate': broken['relations'].append(broken['relations'][0])
            else: broken['relations'][0]['right']['reading'] = 'kurai'
            with tempfile.TemporaryDirectory() as folder:
                path = Path(folder)/'relations.json'
                path.write_text(json.dumps(broken), encoding='utf-8')
                with self.assertRaises(ValueError): load_relations(path)
