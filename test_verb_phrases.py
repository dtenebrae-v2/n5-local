from pathlib import Path
from copy import deepcopy
import unittest
from n5.verb_phrases import load_phrases, public_phrases
from n5.catalog import Catalog
from n5.repository import VocabularyRepository


class VerbPhraseTests(unittest.TestCase):
    def test_current_dictionary_coverage_and_route(self):
        catalog = Catalog(Path('data'), lambda collections: VocabularyRepository(Path('data/vocabulary.json'), collections))
        self.assertIn('/jlpt/n5/verb-phrases', catalog.routes)
        data = load_phrases(Path('data/verb-phrases.json'))
        public = public_phrases(data, catalog.repository.training_words())
        self.assertEqual(len(public['phrases']), public['total_verbs'])
        self.assertGreaterEqual(public['total_verbs'], 170)
        self.assertEqual(public['uncovered'], [])

    def test_user_additions_and_changed_word_identity_are_reported(self):
        catalog = Catalog(Path('data'), lambda collections: VocabularyRepository(Path('data/vocabulary.json'), collections))
        entries = catalog.repository.training_words()
        data = load_phrases(Path('data/verb-phrases.json'))
        original = deepcopy(data)
        verb = next(w for w in entries if w['id'] == 8)
        verb['kanji'] = '別の言葉'
        extra = deepcopy(verb)
        extra['id'] = 99999
        entries.append(extra)
        public = public_phrases(data, entries)
        self.assertEqual({w['id'] for w in public['uncovered']}, {8, 99999})
        self.assertFalse(any(p['word_id'] == 8 for p in public['phrases']))
        self.assertEqual(data, original)
