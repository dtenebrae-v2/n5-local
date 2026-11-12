import copy
import hashlib
import json
from pathlib import Path
import tempfile
import unittest

from n5.exam_sets import ExamSets, validate_exam

ROOT = Path(__file__).parent


def fixture():
    body = b'OggS private audio fixture'
    return {'version':1, 'id':'test', 'title':'Test', 'revision':'a', 'assets':{
        'audio':{'filename':'audio/listening.opus','mime':'audio/ogg','sha256':hashlib.sha256(body).hexdigest(),'duration':10},
        'p1':{'filename':'images/page.png','mime':'image/png','sha256':'a'*64}},
        'sections':[{'id':'listening','title':'Listening','seconds':60,'pages':['p1'],'groups':[{'number':1,'items':[
            {'id':'q1','number':1,'family':'one','choices':3,'pages':['p1'],'correct':1,
             'answer_source':'review','clip':[1,8]}]}], 'audio':'audio'}]}, body


class ExamSetTests(unittest.TestCase):
    def test_absent_private_materials_are_reported_without_startup_failure(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)
            self.assertEqual(ExamSets(root).catalog(),{'sets':[]})
            (root/'exams.json').write_text(json.dumps({'sets':[{'id':'test','title':'Test','catalog':'jlpt/test/exam.json'}]}))
            exams=ExamSets(root)
            self.assertFalse(exams.catalog()['sets'][0]['available'])
            self.assertIsNone(exams.public('test'))

    def test_audio_checksum_and_path_allowlist(self):
        data,body=fixture()
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);directory=root/'jlpt/test';(directory/'audio').mkdir(parents=True)
            (root/'exams.json').write_text(json.dumps({'sets':[{'id':'test','title':'Test','catalog':'jlpt/test/exam.json'}]}))
            (directory/'exam.json').write_text(json.dumps(data));(directory/'audio/listening.opus').write_bytes(body)
            exams=ExamSets(root)
            self.assertTrue(exams.public('test')['assets']['audio']['available'])
            self.assertIsNone(exams.asset('test','../exam.json'))
            (directory/'audio/listening.opus').write_bytes(body+b'changed')
            self.assertIsNone(exams.asset('test','audio'))

    def test_validation_rejects_bad_keys_audio_bounds_and_missing_pages(self):
        original,_=fixture()
        mutations=[lambda d:d['assets']['audio'].update(filename='../../secret'),
                   lambda d:d['sections'][0]['groups'][0]['items'][0].update(correct=3),
                   lambda d:d['sections'][0]['groups'][0]['items'][0].update(clip=[5,20]),
                   lambda d:d['sections'][0]['groups'][0]['items'][0].update(clip=[float('nan'),8]),
                   lambda d:d['sections'][0]['groups'][0]['items'][0].update(pages=['missing']),
                   lambda d:d['assets']['p1'].update(crop=[0,0,0,20]),
                   lambda d:d['assets']['p1'].update(crop=[0,-1,20,20]),
                   lambda d:d['sections'][0]['groups'][0]['items'][0].update(media=[{'asset':'missing','role':'question'}]),
                   lambda d:d['sections'][0]['groups'][0]['items'][0].update(media=[{'asset':'p1','role':'unknown'}]),
                   lambda d:d['sections'][0]['groups'][0]['items'][0].update(answer_source=None)]
        for change in mutations:
            data=copy.deepcopy(original);change(data)
            with self.assertRaises(ValueError):validate_exam(data)

    def test_private_import_coverage_and_original_media(self):
        exams=ExamSets(ROOT/'data/materials')
        if not all(s['available'] for s in exams.catalog()['sets']):self.skipTest('Private sources are not distributed')
        counts={s['id']:s['questions'] for s in exams.catalog()['sets']}
        self.assertEqual(counts,{'n5-2010-2011':80,'n5-2012':61,'n5-2013':91,'n5-2017':89,'n5-2018':91,'n5-2021-12':67})
        for _, data, directory in exams.sets.values():
            for key,asset in data['assets'].items():
                self.assertIsNotNone(exams.asset(data['id'],key))
                if asset['mime']=='audio/ogg':self.assertEqual(asset['sha256'],data['sources']['audio']['sha256'])
            for section in data['sections']:
                for group in section['groups']:
                    for q in group['items']:
                        if section.get('audio'):self.assertIn('clip',q)
                        self.assertIn('media',q)
                        if not q['media']:
                            self.assertEqual(section['id'],'listening')
                            self.assertEqual(group['number'],4)
                        for part in q['media']:
                            asset=data['assets'][part['asset']]
                            self.assertIn('crop',asset)
                            self.assertEqual(asset['width'],asset['crop'][2]-asset['crop'][0])
                            self.assertEqual(asset['height'],asset['crop'][3]-asset['crop'][1])
        self.assertNotIn('listening',[s['id'] for s in exams.sets['n5-2012'][1]['sections']])
        self.assertTrue(all(q['correct'] is None for s in exams.sets['n5-2021-12'][1]['sections'] for g in s['groups'] for q in g['items']))
