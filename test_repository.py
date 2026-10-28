"""Canonical data validation, additions and read-only repository behavior."""
import copy
import json
from pathlib import Path
import tempfile
import unittest

from server import REPOSITORY, CATALOG
from n5.grammar_practice import load_grammar
from n5.repository import VocabularyRepository
from n5.vocabulary import load, validate, add_word, read_json

DATA = Path(__file__).parent / 'data' / 'vocabulary.json'
COLLECTIONS = {item['id'] for item in CATALOG.public['collections']}


class RepositoryTests(unittest.TestCase):
    def test_related_groups_preserve_homonyms(self):
        rows = REPOSITORY.words({'collection': ['complete']}, paginate=False)
        by_id = {row['id']: row for row in rows}
        for entry_id, expected in [(3, 'Colors'), (44, 'Godan'), (65, 'Godan'),
                                   (66, 'Ichidan'), (145, 'Учёба и язык')]:
            self.assertEqual(by_id[entry_id]['related_groups'][0]['name'], expected)
        self.assertIsNone(by_id[3]['group_id'])
        self.assertTrue(any(not row['related_groups'] for row in rows))

    def test_same_word_is_shared_by_sections_and_responses_cannot_mutate_it(self):
        complete = REPOSITORY.words({'collection': ['complete'], 'q': ['青い']})['entries'][0]
        adjective = REPOSITORY.words({'collection': ['i-adjectives'], 'q': ['青い']})['entries'][0]
        self.assertEqual(complete['id'], adjective['id'])
        complete['readings'][0]['kana'] = 'broken'
        self.assertEqual(REPOSITORY.words({'collection': ['complete'], 'q': ['青い']})['entries'][0]['readings'][0]['kana'], 'あおい')

    def test_vocabulary_tasks_distinguish_ambiguous_glosses(self):
        rows = {w['id']: w for w in REPOSITORY.words({}, paginate=False)}
        self.assertNotEqual(rows[8]['vocabulary_task']['prompt'], rows[789]['vocabulary_task']['prompt'])
        self.assertEqual({a['kana'] for a in rows[336]['vocabulary_task']['answers']}, {'ゼロ', 'れい'})
        data = load(DATA, COLLECTIONS)
        data['words'][0]['vocabulary_task'] = {'prompt': 'test', 'answers': []}
        with self.assertRaises(ValueError):
            validate(data, COLLECTIONS)

    def test_export_does_not_paginate(self):
        self.assertEqual(len(REPOSITORY.words({'collection': ['nouns'], 'limit': ['1']}, paginate=False)), 439)


class VocabularyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = load(DATA, COLLECTIONS)

    def test_rejects_bad_data_before_serving(self):
        mutations = [
            lambda d: d['words'].append(copy.deepcopy(d['words'][0])),
            lambda d: d['words'][0].update(unknown='typo'),
            lambda d: d['words'][0].update(readings=[]),
            lambda d: d['words'][0]['readings'][0].update(kana='a/b'),
            lambda d: d['words'][0]['readings'][0].update(kana='漢字'),
            lambda d: d['words'][0].update(meanings={'en': []}),
            lambda d: d['words'][0].update(verb_type='wrong'),
            lambda d: d['words'][0].update(verb_type=[]),
            lambda d: d['words'][0]['memberships'][0].update(group='unknown'),
            lambda d: d['words'][0]['memberships'][0].update(collection='verbs'),
            lambda d: d['words'][0].update(related_words=[999999]),
            lambda d: d['words'][0].update(related_words=[d['words'][0]['id']]),
            lambda d: d['words'][0].update(sources=['javascript:alert(1)']),
            lambda d: d.update(schema_version=2),
            lambda d: d['groups'].append(copy.deepcopy(d['groups'][0])),
            lambda d: d['words'][1].update(id=d['words'][0]['id']),
        ]
        for mutation in mutations:
            document = copy.deepcopy(self.data)
            mutation(document)
            with self.subTest(mutation=mutation), self.assertRaises(ValueError):
                validate(document, COLLECTIONS)

    def test_duplicate_keys_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'bad.json'
            path.write_text('{"id": 1, "id": 2}')
            with self.assertRaisesRegex(ValueError, 'duplicate JSON key'):
                read_json(path)

    def test_addition_is_atomic_and_visible_everywhere(self):
        word = {'kanji': '試験語', 'readings': [{'kana': 'しけんご', 'romaji': 'shikengo'}],
                'meanings': {'en': ['test vocabulary item']}, 'memberships': [
                    {'collection': 'complete', 'group': None},
                    {'collection': 'nouns', 'group': 'nouns:study'}]}
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'vocabulary.json'
            path.write_text(json.dumps(self.data, ensure_ascii=False))
            before = path.read_bytes()
            invalid = copy.deepcopy(word)
            invalid['memberships'][1]['group'] = 'nouns:typo'
            with self.assertRaises(ValueError):
                add_word(path, invalid, COLLECTIONS)
            self.assertEqual(path.read_bytes(), before)
            word_id = add_word(path, word, COLLECTIONS)
            self.assertGreater(word_id, max(w['id'] for w in self.data['words']))
            repo = VocabularyRepository(path, CATALOG.public['collections'])
            for collection in ['complete', 'nouns']:
                result = repo.words({'collection': [collection], 'q': ['shikengo']})
                self.assertEqual(result['total'], 1)
                self.assertEqual(result['entries'][0]['id'], word_id)
                self.assertEqual(repo.count(collection), REPOSITORY.count(collection) + 1)
            self.assertEqual(repo.words({'group': ['nouns:study'], 'q': ['試験語']})['total'], 1)
            after = path.read_bytes()
            with self.assertRaisesRegex(ValueError, 'duplicate word'):
                add_word(path, word, COLLECTIONS)
            self.assertEqual(path.read_bytes(), after)

    def test_merged_duplicates_and_normalized_readings(self):
        self.assertEqual(len(self.data['words']), 851)
        words = {word['id']: word for word in self.data['words']}
        self.assertEqual(len(words[40]['readings']), 2)
        self.assertEqual({m['collection'] for m in words[40]['memberships']}, {'complete', 'i-adjectives'})
        self.assertEqual(words[781]['readings'][0]['kana'], 'まじめ')
        self.assertEqual(words[65]['verb_type'], 'Godan')
        self.assertEqual(words[66]['verb_type'], 'Ichidan')


class GrammarDataTests(unittest.TestCase):
    def test_invalid_grammar_data_is_rejected(self):
        original = read_json(DATA.parent / 'grammar-practice.json')
        cases = []
        invalid = copy.deepcopy(original)
        invalid['exercises'][0]['rule'] = 'missing'
        cases.append(invalid)
        invalid = copy.deepcopy(original)
        invalid['exercises'][0]['answers'][0]['kana'] = 'Latin'
        cases.append(invalid)
        invalid = copy.deepcopy(original)
        invalid['exercises'].append(invalid['exercises'][0])
        cases.append(invalid)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'grammar.json'
            for data in cases:
                path.write_text(json.dumps(data, ensure_ascii=False))
                with self.assertRaises(ValueError):
                    load_grammar(path)
