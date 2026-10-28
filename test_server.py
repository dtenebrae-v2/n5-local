"""Integration checks against a real local HTTP server."""
import csv
import io
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import time
import tempfile
import unittest
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import urlopen, Request


class ServiceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0))
            port = sock.getsockname()[1]
        cls.base = f'http://127.0.0.1:{port}'
        cls.storage = tempfile.TemporaryDirectory()
        cls.process = subprocess.Popen([sys.executable, 'server.py'], cwd=Path(__file__).parent,
                                       env={**os.environ, 'HOST': '127.0.0.1', 'PORT': str(port), 'N5_VOCABULARY': str(Path(cls.storage.name) / 'vocabulary.json')},
                                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for _ in range(50):
            try:
                cls.get('/api/health')
                return
            except OSError:
                time.sleep(.05)
        cls.process.terminate()
        raise RuntimeError('Server did not start')

    @classmethod
    def tearDownClass(cls):
        cls.process.terminate()
        cls.process.wait(timeout=5)
        cls.storage.cleanup()

    @classmethod
    def get(cls, path):
        with urlopen(cls.base + path, timeout=3) as response:
            return json.load(response)

    def test_grammar_practice(self):
        data = self.get('/api/grammar-practice')
        self.assertEqual(len(data['exercises']), 39)
        rules = {r['id'] for r in data['rules']}
        self.assertTrue(all(e['rule'] in rules for e in data['exercises']))
        destination = next(e for e in data['exercises'] if e['id'] == 'grammar:school')
        self.assertEqual({a['kana'] for a in destination['answers']}, {'に', 'へ'})

    def test_counts_and_pagination(self):
        self.assertEqual(self.get('/api/health')['entries'], 851)
        expected = {'complete': 772, 'verbs': 115, 'i-adjectives': 58, 'na-adjectives': 37, 'expressions': 21}
        for collection, count in expected.items():
            data = self.get('/api/words?' + urlencode({'collection': collection, 'limit': 7, 'offset': 2}))
            self.assertEqual(data['total'], count)
            self.assertEqual(len(data['entries']), 7)
            self.assertTrue(all(x['collection'] == collection for x in data['entries']))
        first = self.get('/api/words?collection=complete&limit=7')['entries']
        second = self.get('/api/words?collection=complete&limit=7&offset=7')['entries']
        self.assertFalse({x['id'] for x in first} & {x['id'] for x in second})

    def test_groups_and_readings(self):
        groups = self.get('/api/groups')
        self.assertEqual(len(groups), 48)
        for group in groups:
            data = self.get('/api/words?' + urlencode({'group': group['id']}))
            self.assertEqual(data['total'], group['count'])
            self.assertTrue(all(x['group_id'] == group['id'] for x in data['entries']))
        self.assertEqual(self.get('/api/words?' + urlencode({'collection': 'na-adjectives', 'q': 'まじめ'}))['total'], 1)

    def test_search_and_parameter_safety(self):
        for q in ['water', 'mizu', 'みず', '水']:
            self.assertGreater(self.get('/api/words?' + urlencode({'q': q, 'collection': 'complete'}))['total'], 0)
        for q in ["' OR 1=1 --", '%', '_', 'nonexistentword12345']:
            self.assertEqual(self.get('/api/words?' + urlencode({'q': q}))['total'], 0)
        with self.assertRaises(HTTPError) as error:
            self.get('/api/words?limit=abc')
        self.assertEqual(error.exception.code, 400)

    def test_filtered_export(self):
        with urlopen(self.base + '/api/export.csv?collection=verbs&q=meet') as response:
            self.assertIn('attachment', response.headers['Content-Disposition'])
            rows = list(csv.DictReader(io.StringIO(response.read().decode('utf-8-sig'))))
        self.assertEqual(len(rows), self.get('/api/words?collection=verbs&q=meet')['total'])
        self.assertTrue(all(x['collection'] == 'verbs' for x in rows))

    def test_noun_collection(self):
        data = self.get('/api/words?collection=nouns&limit=200')
        rest = self.get('/api/words?collection=nouns&limit=200&offset=200')
        entries = data['entries'] + rest['entries'] + self.get('/api/words?collection=nouns&limit=200&offset=400')['entries']
        self.assertEqual(data['total'], 439)
        self.assertEqual(len({e['id'] for e in entries}), 439)
        words = {e['kanji'] for e in entries}
        self.assertTrue({'学校', 'お水', '勉強', '明日'} <= words)
        self.assertFalse({'会う', '青い', 'しかし', '同じ', '私'} & words)
        groups = self.get('/api/groups?collection=nouns')
        self.assertEqual(sum(g['count'] for g in groups), data['total'])
        for group in groups:
            filtered = self.get('/api/words?' + urlencode({'collection': 'nouns', 'group': group['id']}))
            self.assertEqual(filtered['total'], group['count'])
            self.assertTrue(all(e['group_id'] == group['id'] for e in filtered['entries']))
        for query in ['water', 'mizu', 'みず', 'お水']:
            self.assertGreater(self.get('/api/words?' + urlencode({'collection': 'nouns', 'q': query}))['total'], 0)
        self.assertEqual(self.get('/api/words?collection=nouns&q=to%20meet')['total'], 0)
        group = 'nouns:time'
        params = urlencode({'collection': 'nouns', 'group': group, 'q': 'morning'})
        with urlopen(self.base + '/api/export.csv?' + params) as response:
            rows = list(csv.DictReader(io.StringIO(response.read().decode('utf-8-sig'))))
        filtered = self.get('/api/words?' + params)
        self.assertGreater(len(rows), 0)
        self.assertEqual([r['kanji'] for r in rows], [e['kanji'] for e in filtered['entries']])
        with urlopen(self.base + '/jlpt/n5/vocabulary/nouns') as response:
            self.assertEqual(response.status, 200)

    def test_noun_topics_are_complete_disjoint_and_exported(self):
        expected = {'nouns:people': '兄', 'nouns:food': '牛乳', 'nouns:study': '学校',
                    'nouns:transport': '電車', 'nouns:calendar': '月曜日'}
        seen = set()
        groups = self.get('/api/groups?collection=nouns')
        for group in groups:
            data = self.get('/api/words?' + urlencode({'group': group['id'], 'limit': 200}))
            ids = {entry['id'] for entry in data['entries']}
            self.assertFalse(seen & ids)
            seen.update(ids)
            self.assertEqual(len(ids), group['count'])
            for entry in data['entries']:
                self.assertEqual(entry['group_name'], group['name'])
                self.assertEqual(entry['collection'], 'nouns')
            if group['id'] in expected:
                self.assertIn(expected[group['id']], {entry['kanji'] for entry in data['entries']})
        self.assertEqual(len(seen), 439)
        for collection in ['nouns', 'verbs']:
            params = urlencode({'collection': collection, 'group': 'nouns:food', 'q': 'milk'})
            data = self.get('/api/words?' + params)
            self.assertEqual(data['total'], 1 if collection == 'nouns' else 0)
        params = urlencode({'collection': 'nouns', 'group': 'nouns:food', 'q': 'milk'})
        with urlopen(self.base + '/api/export.csv?' + params) as response:
            rows = list(csv.DictReader(io.StringIO(response.read().decode('utf-8-sig'))))
        self.assertEqual(rows[0]['group_name'], 'Еда и напитки')

    def test_catalog_counts_routes_and_modules(self):
        catalog = self.get('/api/catalog')
        for collection in catalog['collections']:
            data = self.get('/api/words?' + urlencode({'collection': collection['id']}))
            self.assertEqual(collection['count'], data['total'])
        by_id = {item['id']: item for item in catalog['collections']}
        for section in catalog['sections']:
            self.assertEqual(section['count'], sum(by_id[key]['count'] for key in section['children']))
        for item in catalog['collections'] + catalog['sections'] + catalog['lessons']:
            with urlopen(self.base + item['path']) as response:
                self.assertEqual(response.status, 200)
        for path in Path('static').rglob('*.js'):
            with urlopen(self.base + '/' + path.relative_to('static').as_posix()) as response:
                self.assertIn('text/javascript', response.headers['Content-Type'])
                self.assertTrue(response.read())
        nouns = by_id['nouns']
        self.assertNotIn('source_collection', nouns)
        self.assertNotIn('subset_file', nouns)

    def test_practice_metadata_and_iru_correction(self):
        catalog = self.get('/api/catalog')
        supported = {c['id']: c['practice_kind'] for c in catalog['collections'] if 'practice_kind' in c}
        self.assertEqual(supported, {
            'nouns': 'noun', 'verbs': 'verb',
            'i-adjectives': 'i-adjective', 'na-adjectives': 'na-adjective',
        })
        words = self.get('/api/words?' + urlencode({'collection': 'verbs', 'q': 'いる'}))['entries']
        by_id = {entry['id']: entry for entry in words}
        self.assertEqual(by_id[65]['type'], 'Godan')
        self.assertEqual(by_id[65]['group_id'], 'verbs:70')
        self.assertEqual(by_id[66]['type'], 'Ichidan')

    def test_lessons_and_routes(self):
        lessons = self.get('/api/lessons')
        self.assertEqual(len(lessons), 8)
        for lesson in lessons:
            page = self.get('/api/lesson?' + urlencode({'path': lesson['path']}))
            self.assertTrue(page['html'])
            for forbidden in ['<script', 'onclick=', 'href="/signin', '<svg']:
                self.assertNotIn(forbidden, page['html'])
            with urlopen(self.base + lesson['path']) as response:
                self.assertEqual(response.status, 200)
                self.assertIn('default-src', response.headers['Content-Security-Policy'])
        for path in ['/api/lesson?path=unknown', '/data/vocabulary.json', '/not-found', '/../../etc/passwd']:
            with self.assertRaises(HTTPError) as error:
                self.get(path)
            self.assertEqual(error.exception.code, 404)

    def test_z_add_word_http_validation_and_refresh(self):
        payload = {'kanji': '試験語', 'readings': [{'kana': 'しけんご', 'romaji': 'shikengo'}],
                   'meanings': ['test vocabulary item'], 'collection': 'nouns', 'group': 'nouns:study'}
        def post(value, expected, **headers):
            request = Request(self.base + '/api/words', data=json.dumps(value).encode(),
                              headers={'Content-Type': 'application/json', **headers}, method='POST')
            try:
                response = urlopen(request)
            except HTTPError as error:
                response = error
            with response:
                self.assertEqual(response.status, expected)
                return json.load(response)
        before = self.get('/api/health')['entries']
        post({}, 400)
        post({**payload, 'group': 'verbs:70'}, 400)
        post(payload, 403, Origin='http://another-site.test')
        result = post(payload, 201)
        self.assertEqual(self.get('/api/health')['entries'], before + 1)
        self.assertEqual(next(c['count'] for c in result['catalog']['collections'] if c['id'] == 'nouns'), 440)
        data = self.get('/api/words?collection=nouns&q=shikengo')
        self.assertEqual(data['entries'][0]['id'], result['id'])
        self.assertEqual(self.get('/api/words?collection=complete&q=shikengo')['total'], 1)
        with urlopen(self.base + '/api/export.csv?q=shikengo') as response:
            self.assertIn('試験語', response.read().decode('utf-8-sig'))
        post(payload, 409)
        self.assertEqual(self.get('/api/health')['entries'], before + 1)


if __name__ == '__main__':
    unittest.main(verbosity=2)
