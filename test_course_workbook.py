"""Private workbook assets and exercise import work without a source PDF."""
import copy
import hashlib
import json
from pathlib import Path
import tempfile
import unittest

from n5.course_workbook import CourseWorkbook, validate
from scripts.import_course_workbook import number_reading, number_written, clock_readings


class CourseWorkbookTests(unittest.TestCase):
    def fixture(self):
        return {'version':1,'title':'Тетрадь','units':[{'id':'17','title':'Урок 17'}],
                'items':[{'id':'17-translation-1','unit':'17','kind':'translation','prompt':'Переведите.',
                          'answer':'例です。','source':{'page':68,'answer_page':143}}], 'assets':{}}

    def test_standalone_import_does_not_need_pdf_and_detects_changed_images(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);data=self.fixture();image=b'local-png-fixture'
            (root/'image.png').write_bytes(image)
            data['assets']['q-17']={'filename':'image.png','sha256':hashlib.sha256(image).hexdigest()}
            data['items'][0]['images']=['q-17']
            (root/'workbook.json').write_text(json.dumps(data))
            book=CourseWorkbook(root)
            self.assertTrue(book.public()['available'])
            self.assertEqual(book.public()['items'][0]['answer'],'例です。')
            self.assertEqual(book.public()['assets']['q-17']['url'],'/course-workbook-files/q-17')
            self.assertEqual(book.asset('q-17')[0],root/'image.png')
            self.assertIsNone(book.asset('../../workbook'))
            (root/'image.png').write_bytes(b'changed')
            self.assertIsNone(book.asset('q-17'))
            self.assertFalse(list(root.glob('*.pdf')))

    def test_missing_optional_materials_do_not_break_course(self):
        with tempfile.TemporaryDirectory() as folder:
            self.assertFalse(CourseWorkbook(Path(folder)/'missing').public()['available'])

    def test_invalid_material_references_are_rejected(self):
        for mutate in [lambda d:d['items'].append(copy.deepcopy(d['items'][0])),
                       lambda d:d['items'][0].update(answer=''),
                       lambda d:d['items'][0].update(answer_images=['missing']),
                       lambda d:d['items'][0].update(answers=[]),
                       lambda d:d['assets'].update(x={'filename':'../private.png','sha256':'a'*64})]:
            data=self.fixture();mutate(data)
            with self.assertRaises(ValueError):validate(data)

    def test_corrected_numbers_and_clock_keys(self):
        self.assertEqual(number_reading(5008),'ごせんはち')
        self.assertEqual(number_reading(379),'さんびゃくななじゅうきゅう')
        self.assertEqual(number_reading(3547),'さんぜんごひゃくよんじゅうなな')
        self.assertEqual(number_written(432),'四百三十二')
        self.assertEqual(clock_readings(9,36),['くじさんじゅうろっぷん'])
        self.assertEqual(clock_readings(13,13),['じゅうさんじじゅうさんぷん'])
        self.assertIn('よじはん',clock_readings(4,30))


if __name__=='__main__':unittest.main()
