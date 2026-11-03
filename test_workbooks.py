import copy
import hashlib
import io
import json
from pathlib import Path
import tempfile
import unittest
from zipfile import ZipFile

from n5.workbooks import Workbooks, validate_workbook
from scripts.import_somatome import restore_audio

ROOT = Path(__file__).parent


def fixture():
    content = b'ID3 original fixture audio'
    return {'version':1, 'id':'example', 'isbn':'1234567890123', 'title':'Example', 'year':2017,
            'publisher':'Example', 'authors':['Example'], 'audio_source':{'isbn':'1234567890123'},
            'units':[{'id':'u1', 'questions':['q1'], 'audio':'Track001'}],
            'items':[{'id':'q1','unit':'u1','prompt':'Choose','choices':['a','b','c'], 'correct':0,
                      'answer_source':'review','audio':'Track001'}],
            'assets':{'Track001':{'filename':'audio/Track001.mp3','kind':'audio','mime':'audio/mpeg',
                                 'sha256':hashlib.sha256(content).hexdigest(),'bytes':len(content)}}}, content


class WorkbookTests(unittest.TestCase):
    def test_integrity_paths_and_missing_personal_catalog(self):
        data, content = fixture()
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            index = {'books':[{'id':'example','isbn':data['isbn'],'catalog':'example/workbook.json'}]}
            (root/'workbooks.json').write_text(json.dumps(index))
            self.assertFalse(Workbooks(root).catalog()['books'][0]['available'])
            directory = root/'example'; directory.mkdir()
            (directory/'workbook.json').write_text(json.dumps(data))
            books = Workbooks(root)
            self.assertIsNone(books.asset('example','Track001'))
            (directory/'audio').mkdir(); (directory/'audio/Track001.mp3').write_bytes(content)
            self.assertTrue(books.public('example')['assets']['Track001']['available'])
            self.assertIsNone(books.asset('example','../../server.py'))
            (directory/'audio/Track001.mp3').write_bytes(content+b'changed')
            self.assertIsNone(books.asset('example','Track001'))
            data['assets']['Track001']['filename'] = '../../outside.mp3'
            with self.assertRaises(ValueError): validate_workbook(data)

    def test_invalid_answer_order_membership_and_unknown_media(self):
        original, _ = fixture()
        for mutation in ('answer','order','membership','media','duplicate'):
            data = copy.deepcopy(original)
            if mutation=='answer': data['items'][0]['correct']=9
            if mutation=='order': data['items'][0]['order']=[1,2,3,4]
            if mutation=='membership': data['units'][0]['questions']=[]
            if mutation=='media': data['items'][0]['audio']='unknown'
            if mutation=='duplicate': data['items'].append(data['items'][0])
            with self.assertRaises(ValueError): validate_workbook(data)

    def test_audio_restore_checks_complete_archive_before_writing(self):
        data, content = fixture()
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'workbook.json';path.write_text(json.dumps(data))
            def archive(name, value):
                buffer=io.BytesIO()
                with ZipFile(buffer,'w') as output:output.writestr(name,value)
                return buffer.getvalue()
            self.assertEqual(restore_audio(path,archive('Track001.mp3',content)),1)
            for name,value in [('Track002.mp3',content),('Track001.mp3',content+b'changed')]:
                with self.assertRaises(ValueError):restore_audio(path,archive(name,value))
            self.assertEqual((path.parent/'audio/Track001.mp3').read_bytes(),content)

    def test_local_book_coverage_and_all_original_audio_digests(self):
        path = ROOT/'data/materials/somatome/n5-2017/workbook.json'
        if not path.exists():self.skipTest('Personal workbook is intentionally not distributed')
        data=validate_workbook(json.loads(path.read_text()))
        self.assertEqual(len(data['items']),239)
        self.assertEqual(len(data['units']),42)
        self.assertEqual(sum(q['correct'] is None for q in data['items']),0)
        self.assertEqual(sum(a['kind']=='audio' for a in data['assets'].values()),25)
        self.assertEqual({q['audio'] for q in data['items'] if q.get('audio')}, {f'Track{i:03}' for i in range(2,26)})
        self.assertEqual(next(u for u in data['units'] if u['id']=='w6d1')['audio'],'Track001')
        for asset in data['assets'].values():
            file = path.parent/asset['filename']
            self.assertEqual(hashlib.sha256(file.read_bytes()).hexdigest(),asset['sha256'])
        for week in range(1,7):self.assertEqual(len([u for u in data['units'] if u['week']==week]),7)
