import copy
import hashlib
import json
import io
from urllib.error import URLError
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from n5.library import Library, byte_range, validate_catalog, download_asset
from n5.tadoku import candidates, parse_book, parse_narrators, approved_url, LICENSE, AUDIO_SOURCE

ROOT=Path(__file__).parent
PAGE=f'''<div class="bd-title"><h1><ruby>鏡<rt>かがみ</rt></ruby>のない村</h1></div>
<div class="bd-author"><ul><li>再話：NPO多言語多読</li><li>絵：作者</li></ul></div>
<a href="/japanese/book-search?level=l2">Level 2</a>
<div class="bd-note"><a href="{LICENSE}">CC BY-NC-ND 4.0</a></div>
<table><tr><th>Pages</th><td>14</td></tr></table>
<a href="/japanese/wp-content/uploads/book.pdf">PDF(電子本)</a>
<a href="/japanese/wp-content/uploads/print.pdf">PDF(印刷用)</a>
<a href="/japanese/wp-content/uploads/book.mp3">MP3</a>'''


class LibraryTests(unittest.TestCase):
    def test_current_catalogue_includes_all_reviewed_level_1_and_2_books(self):
        data=validate_catalog(json.loads((ROOT/'data/library.json').read_text()))
        self.assertEqual(len(data['books']),44)
        for level,count in [(1,25),(2,19)]:self.assertEqual(sum(b['level']==level for b in data['books']),count)
        self.assertIn('61371',{b['id'] for b in data['books']})
        for book in data['books']:
            self.assertTrue(book['credits'])
            self.assertEqual(book['license']['evidence'],book['source'])
            if 'audio' in book['assets']:
                self.assertNotIn('license',book['assets']['audio'],'Book license must not be assumed to cover audio')

    def test_extraction_preserves_authors_ruby_and_separate_audio_permission(self):
        book=parse_book(PAGE,'https://tadoku.org/japanese/book/1/',{'1':'Narrator'})
        self.assertEqual(book['title'],'鏡のない村')
        self.assertEqual(book['level'],2)
        self.assertEqual(book['credits'],['再話：NPO多言語多読','絵：作者'])
        self.assertIn('print',book['assets'])
        self.assertEqual(book['assets']['audio']['permission'],'personal-learning-download')
        self.assertNotIn('audio',parse_book(PAGE,'https://tadoku.org/japanese/book/1/')['assets'])
        self.assertRaises(ValueError,parse_book,PAGE.replace('Level 2','Level 0'),'https://tadoku.org/japanese/book/1/')
        self.assertRaises(ValueError,parse_book,PAGE.replace(LICENSE,'https://example.com/license'),'https://tadoku.org/japanese/book/1/')

    def test_unlicensed_and_external_assets_are_rejected(self):
        for url in ['http://tadoku.org/x','https://tadoku.org.evil.test/x','https://user@tadoku.org/x','https://tadoku.org:443/x']:
            self.assertRaises(ValueError,approved_url,url)
        self.assertRaises(ValueError,approved_url,'https://tadoku.org/private',True)
        data=json.loads((ROOT/'data/library.json').read_text())
        for alteration in [{'level':0},{'credits':[]},{'id':'../private'},{'license':{'url':LICENSE,'evidence':'other'}}]:
            broken=copy.deepcopy(data);broken['books'][0].update(alteration)
            self.assertRaises(ValueError,validate_catalog,broken)
        broken=copy.deepcopy(data);broken['books'][0]['assets']['pdf']['filename']='../../server.py'
        self.assertRaises(ValueError,validate_catalog,broken)

    def test_integrity_cache_detects_changed_original_and_missing_files(self):
        data=json.loads((ROOT/'data/library.json').read_text());data['books']=data['books'][:1]
        content=b'%PDF-1.4\nfixture original bytes'
        asset=data['books'][0]['assets']['pdf'];asset.update(sha256=hashlib.sha256(content).hexdigest(),bytes=len(content))
        with tempfile.TemporaryDirectory() as folder:
            directory=Path(folder);catalog=directory/'catalog.json';catalog.write_text(json.dumps(data))
            library=Library(catalog,directory)
            self.assertIsNone(library.asset(data['books'][0]['id'],'pdf'))
            (directory/asset['filename']).write_bytes(content)
            self.assertIsNotNone(library.asset(data['books'][0]['id'],'pdf'))
            (directory/asset['filename']).write_bytes(content+b'changed')
            self.assertIsNone(library.asset(data['books'][0]['id'],'pdf'))
            self.assertIsNone(library.asset('../server','pdf'))

    def test_ranges_allow_seeking_and_reject_invalid_requests(self):
        for header,result in [(None,(0,99,False)),('bytes=10-19',(10,19,True)),('bytes=90-',(90,99,True)),('bytes=-12',(88,99,True)),('bytes=0-999',(0,99,True))]:
            self.assertEqual(byte_range(header,100),result)
        for header in ['bytes=100-','bytes=20-10','bytes=-0','bytes=1-2,5-6','items=0-10']:
            self.assertRaises(ValueError,byte_range,header,100)

    def test_level_zero_never_enters_candidates(self):
        html=''.join(f'<div class="freebooks-book-item" data-level="l{level}" data-keywords="{LICENSE}"><a href="https://tadoku.org/japanese/book/{level+1}/">Book</a></div>' for level in range(4))
        self.assertEqual([c['level'] for c in candidates(html)],[1,2])


class DownloadTests(unittest.TestCase):
    def test_download_is_atomic_unchanged_and_digest_checked(self):
        content=b'%PDF-1.4\noriginal fixture\n%%EOF\n'
        asset={'url':'https://tadoku.org/japanese/wp-content/uploads/original.pdf','filename':'1-pdf.pdf'}
        class Response(io.BytesIO):
            headers={'Content-Length':str(len(content))}
        with tempfile.TemporaryDirectory() as folder, patch('n5.library.build_opener') as opener, patch('n5.library.time.sleep'):
            opener.return_value.open.side_effect=lambda *a,**k:Response(content)
            info=download_asset(asset,folder)
            self.assertEqual((Path(folder)/'1-pdf.pdf').read_bytes(),content)
            self.assertEqual(info['sha256'],hashlib.sha256(content).hexdigest())
            changed={**asset,'sha256':'0'*64}
            with self.assertRaises(ValueError):download_asset(changed,folder)
            self.assertEqual((Path(folder)/'1-pdf.pdf').read_bytes(),content)
            self.assertEqual(list(Path(folder).glob('.download-*')),[])

    def test_truncated_responses_never_replace_originals(self):
        content=b'%PDF-1.4\npartial'
        class Response(io.BytesIO):
            headers={'Content-Length':'9999'}
        asset={'url':'https://tadoku.org/japanese/wp-content/uploads/original.pdf','filename':'1-pdf.pdf'}
        with tempfile.TemporaryDirectory() as folder, patch('n5.library.build_opener') as opener, patch('n5.library.time.sleep'):
            opener.return_value.open.side_effect=lambda *a,**k:Response(content)
            with self.assertRaises(URLError):download_asset(asset,folder)
            self.assertFalse((Path(folder)/'1-pdf.pdf').exists())
            self.assertEqual(list(Path(folder).glob('.download-*')),[])


class ImportSelectionTests(unittest.TestCase):
    def test_all_has_no_balanced_level_quota(self):
        from scripts.import_tadoku import scan
        options=[{'url':f'https://tadoku.org/japanese/book/{i}/','level':1 if i<5 else 2,'has_audio':False} for i in range(1,6)]
        def source(url):
            if url==AUDIO_SOURCE:return '<table></table>'
            level=1 if '/book/' in url and int(url.strip('/').split('/')[-1])<5 else 2
            return PAGE.replace('Level 2',f'Level {level}')
        with patch('scripts.import_tadoku.fetch',return_value=b'User-agent: *\nAllow: /'), patch('scripts.import_tadoku.page',side_effect=source), patch('scripts.import_tadoku.candidates',return_value=options), patch('builtins.print'):
            self.assertEqual(len(scan()['books']),5)
            self.assertEqual(len(scan(2)['books']),2)

    def test_full_scan_does_not_silently_accept_unavailable_books(self):
        from scripts.import_tadoku import scan
        option={'url':'https://tadoku.org/japanese/book/1/','level':1,'has_audio':False}
        def source(url):
            if '/book/' in url:raise URLError('temporary outage')
            return '<html></html>'
        with patch('scripts.import_tadoku.fetch',return_value=b'User-agent: *\nAllow: /'), patch('scripts.import_tadoku.page',side_effect=source), patch('scripts.import_tadoku.candidates',return_value=[option]), patch('builtins.print'):
            self.assertRaises(RuntimeError,scan)
