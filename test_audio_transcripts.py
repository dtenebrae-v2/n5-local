import copy
import json
from pathlib import Path
import tempfile
import unittest

from n5.audio_transcripts import AudioTranscripts
from n5.audio import audio_catalog
from n5.exam_sets import ExamSets
from n5.workbooks import Workbooks
from n5.library import Library

ROOT = Path(__file__).parent


class AudioTranscriptTests(unittest.TestCase):
    def test_validation_and_source_checksum(self):
        value = {'version':1, 'tracks':{'exam:fixture:recording':{
            'status':'automatic', 'sha256':'a' * 64, 'duration':20,
            'segments':[{'start':1, 'end':2, 'text':'日本語'}]}}}
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'transcripts.json'
            path.write_text(json.dumps(value), encoding='utf-8')
            transcripts = AudioTranscripts(path)
            self.assertIsNotNone(transcripts.get('exam:fixture:recording', 'a' * 64))
            self.assertIsNone(transcripts.get('exam:fixture:recording', 'b' * 64))
            self.assertIsNone(transcripts.get('unknown', 'a' * 64))
            for change in ('negative', 'backward', 'nan', 'past-end', 'empty'):
                invalid = copy.deepcopy(value)
                item = invalid['tracks']['exam:fixture:recording']['segments'][0]
                if change == 'negative': item['start'] = -1
                if change == 'backward': item['end'] = .5
                if change == 'nan': item['end'] = float('nan')
                if change == 'past-end': item['end'] = 40
                if change == 'empty': item['text'] = ''
                path.write_text(json.dumps(invalid), encoding='utf-8')
                with self.subTest(change=change), self.assertRaises(ValueError):
                    AudioTranscripts(path)

    def test_all_exam_and_workbook_tracks_have_scripts_but_books_do_not(self):
        root = ROOT / 'data/materials'
        scripts = AudioTranscripts(root / 'audio/transcripts.json')
        catalog = audio_catalog(ExamSets(root), Workbooks(root),
                                Library(root / 'tadoku/catalog.json', root / 'tadoku/files'), scripts)['tracks']
        studied = [t for t in catalog if t['group'] != 'books']
        self.assertEqual(len(studied), 55)
        shared = [t for t in studied if t.get('family') == 'jlpt-n5-shared-2010-2012-2017']
        self.assertEqual({t['id'] for t in shared}, {'exam:n5-2010-2011:recording',
                                                    'exam:n5-2012:recording', 'exam:n5-2017:recording'})
        self.assertEqual(len({t['sha256'] for t in studied}), len(studied), 'Recordings must not be identical copies')
        for track in studied:
            self.assertTrue(track['transcript']['available'], track['id'])
            self.assertGreater(len(scripts.get(track['id'],track['sha256'])['segments']), 0)
        self.assertTrue(all('transcript' not in t for t in catalog if t['group'] == 'books'))
