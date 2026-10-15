import copy
import json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from n5.store import VocabularyStore, WordError

DATA = Path(__file__).parent / 'data'
PAYLOAD = {'kanji': '試験語', 'readings': [{'kana': 'しけんご', 'romaji': 'shikengo'}],
           'meanings': ['test vocabulary item'], 'collection': 'nouns', 'group': 'nouns:study'}


class StoreTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.path = Path(self.directory.name) / 'vocabulary.json'
        self.store = VocabularyStore(DATA, self.path)

    def old_dictionary(self):
        bundled = json.loads((DATA / 'vocabulary.json').read_text())
        updates = json.loads((DATA / 'vocabulary-updates.json').read_text())
        bundled['words'] = [w for w in bundled['words'] if w['id'] not in updates['add']]
        for correction in updates['replace']:
            word = next(w for w in bundled['words'] if w['id'] == correction['id'])
            word.update(correction['before'])
        return bundled, updates

    def test_bundle_update_preserves_custom_words_and_id_collisions(self):
        document, updates = self.old_dictionary()
        custom = copy.deepcopy(document['words'][0])
        custom.update(id=updates['add'][0], kanji='試験語', readings=[{'kana': 'しけんご', 'romaji': 'shikengo'}])
        document['words'].append(custom)
        self.path.write_text(json.dumps(document, ensure_ascii=False))
        migrated = VocabularyStore(DATA, self.path)
        words = json.loads(self.path.read_text())['words']
        self.assertEqual(len(words), 852)
        self.assertEqual(next(w for w in words if w['id'] == custom['id']), custom)
        self.assertEqual(len({w['id'] for w in words}), len(words))
        self.assertEqual(next(w for w in words if w['id'] == 489)['kanji'], 'パーティー')
        self.assertEqual(next(w for w in words if w['kanji'] == '居る')['verb_type'], 'Godan')
        self.assertEqual(migrated.catalog.repository.words({'q': ['私たち']})['total'], 1)
        before = self.path.read_bytes()
        VocabularyStore(DATA, self.path)
        self.assertEqual(self.path.read_bytes(), before)

    def test_bundle_update_failure_is_atomic(self):
        document, _ = self.old_dictionary()
        self.path.write_text(json.dumps(document, ensure_ascii=False))
        before = self.path.read_bytes()
        with patch('n5.vocabulary.os.replace', side_effect=OSError('disk full')):
            with self.assertRaises(OSError):
                VocabularyStore(DATA, self.path)
        self.assertEqual(self.path.read_bytes(), before)
        self.assertEqual(len(list(self.path.parent.iterdir())), 1)

    def test_required_fields_rejected_without_writes(self):
        before = self.path.read_bytes()
        cases = [{key: value for key, value in PAYLOAD.items() if key != missing} for missing in PAYLOAD]
        cases += [{**PAYLOAD, 'kanji': '   '}, {**PAYLOAD, 'readings': [{'kana': '漢字', 'romaji': 'kanji'}]},
                  {**PAYLOAD, 'readings': [{'kana': 'かんじ', 'romaji': ''}]},
                  {**PAYLOAD, 'collection': 'verbs', 'group': 'verbs:71'},
                  {**PAYLOAD, 'group': 'verbs:70'}, {**PAYLOAD, 'meanings': ['']},
                  {**PAYLOAD, 'source': 'javascript:alert(1)'}]
        for payload in cases:
            with self.subTest(payload=payload), self.assertRaises(WordError):
                self.store.add(payload)
        self.assertEqual(self.path.read_bytes(), before)

    def test_concurrent_writes_survive_reload_and_update_catalog(self):
        before = self.store.catalog.repository.count()
        payloads = [{**PAYLOAD, 'kanji': '試験語' + str(i)} for i in range(4)]
        with ThreadPoolExecutor(max_workers=4) as pool:
            results = list(pool.map(self.store.add, payloads))
        self.assertEqual(len({r['id'] for r in results}), 4)
        restarted = VocabularyStore(DATA, self.path)
        self.assertEqual(restarted.catalog.repository.count(), before + 4)
        self.assertEqual(restarted.catalog.repository.words({'q': ['shikengo']})['total'], 4)
        self.assertEqual(next(c['count'] for c in restarted.catalog.public['collections'] if c['id'] == 'nouns'), 443)
        with self.assertRaises(WordError) as failure:
            restarted.add(payloads[0])
        self.assertEqual(failure.exception.status, 409)

    def test_write_failure_keeps_file_and_snapshot(self):
        before = self.path.read_bytes()
        catalog = self.store.catalog
        with patch('n5.vocabulary.os.replace', side_effect=OSError('disk full')):
            with self.assertRaises(OSError):
                self.store.add(PAYLOAD)
        self.assertEqual(self.path.read_bytes(), before)
        self.assertIs(self.store.catalog, catalog)
        self.assertEqual(len(list(self.path.parent.iterdir())), 1)

    def test_all_word_categories(self):
        for collection, group, kana, expected_type in [
            ('complete', None, 'しけん', None), ('verbs', 'verbs:70', 'ためす', 'Godan'),
            ('verbs', 'verbs:71', 'しらべる', 'Ichidan'), ('verbs', 'verbs:72', 'する', 'Irregular'),
            ('i-adjectives', 'i-adjectives:50', 'あおい', None),
            ('na-adjectives', 'na-adjectives:60', 'すき', None),
            ('expressions', 'expressions:43', 'こんにちは', None),
        ]:
            payload = copy.deepcopy(PAYLOAD)
            payload.update(kanji='試験' + collection + kana, collection=collection, group=group,
                           readings=[{'kana': kana, 'romaji': 'test'}])
            result = self.store.add(payload)
            row = self.store.catalog.repository.words({'collection': [collection], 'q': [payload['kanji']]})['entries'][0]
            self.assertEqual(row['id'], result['id'])
            self.assertEqual(row['type'], expected_type)
