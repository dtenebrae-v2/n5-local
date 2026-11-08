"""Validated catalogue and byte-for-byte storage of original reading materials."""
import hashlib
import json
from pathlib import Path
import re
import tempfile
import time
from urllib.request import Request, build_opener, HTTPRedirectHandler
from urllib.error import HTTPError, URLError

from n5.tadoku import approved_url, LICENSE, AUDIO_SOURCE


class OriginalRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        approved_url(newurl, asset=True)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def validate_catalog(data):
    if data.get('version') != 1 or data.get('usage') != 'personal-noncommercial':
        raise ValueError('Unexpected library format or usage')
    ids = set()
    for book in data['books']:
        bid = book.get('id','')
        if not re.fullmatch(r'\d+',bid) or bid in ids or book.get('level') not in {1,2}:
            raise ValueError('Invalid book ID or level')
        ids.add(bid)
        if 'pdf_pages' in book and (type(book['pdf_pages']) is not int or book['pdf_pages'] < 1):
            raise ValueError('Invalid PDF page count')
        if not book.get('title') or not book.get('credits') or book.get('license',{}).get('url') != LICENSE:
            raise ValueError('Missing attribution or license')
        approved_url(book['source'])
        if book['license'].get('evidence') != book['source']:
            raise ValueError('Missing book-specific license evidence')
        if 'pdf' not in book.get('assets',{}):
            raise ValueError('Missing original PDF')
        for kind,asset in book['assets'].items():
            extension = 'mp3' if kind == 'audio' else 'pdf'
            if kind not in {'pdf','print','audio'} or asset.get('filename') != f'{bid}-{kind}.{extension}':
                raise ValueError('Unexpected asset filename')
            approved_url(asset['url'],asset=True)
            if kind == 'audio':
                if asset.get('permission') != 'personal-learning-download' or not asset.get('narrator') or not asset.get('rights_holder') or asset.get('evidence') != AUDIO_SOURCE:
                    raise ValueError('Unverified audio permission or credits')
            elif asset.get('license') != 'CC-BY-NC-ND-4.0':
                raise ValueError('Unverified PDF license')
            if 'sha256' in asset and not re.fullmatch(r'[a-f0-9]{64}',asset['sha256']):
                raise ValueError('Invalid file digest')
    return data


def _download_original(asset, directory):
    url = approved_url(asset['url'],asset=True)
    filename = asset['filename']
    if not re.fullmatch(r'\d+-(?:pdf|print)\.pdf|\d+-audio\.mp3',filename):
        raise ValueError('Unexpected filename')
    directory = Path(directory)
    directory.mkdir(parents=True,exist_ok=True)
    destination = directory/filename
    if destination.exists() and asset.get('sha256'):
        with destination.open('rb') as cached:
            digest=hashlib.file_digest(cached,'sha256').hexdigest()
        if digest == asset['sha256']:
            return {'bytes':destination.stat().st_size,'sha256':digest}
    temporary = None
    try:
        with build_opener(OriginalRedirect()).open(Request(url,headers={'User-Agent':'N5Local-PersonalLibrary/1.0'}),timeout=90) as response:
            expected_size = int(response.headers.get('Content-Length','0'))
            with tempfile.NamedTemporaryFile(dir=directory,prefix='.download-',delete=False) as output:
                temporary=Path(output.name)
                digest=hashlib.sha256();size=0;prefix=b''
                while chunk:=response.read(65536):
                    if not prefix: prefix=chunk[:10]
                    size+=len(chunk)
                    if size>100*1024*1024:
                        raise ValueError('File exceeds 100 MiB limit')
                    output.write(chunk);digest.update(chunk)
        if expected_size and expected_size != size:
            raise URLError('Incomplete original download')
        if filename.endswith('.pdf'):
            with temporary.open('rb') as document:
                document.seek(max(0,size-2048))
                if b'%%EOF' not in document.read():
                    raise URLError('Incomplete PDF: missing end marker')
        if filename.endswith('.pdf') and not prefix.startswith(b'%PDF-'):
            raise ValueError('Response is not a PDF')
        if filename.endswith('.mp3') and not (prefix.startswith(b'ID3') or len(prefix)>=2 and prefix[0]==255 and prefix[1]&224==224):
            raise ValueError('Response is not MP3 audio')
        checksum=digest.hexdigest()
        if asset.get('sha256') and asset['sha256'] != checksum:
            raise ValueError('Original changed: review the new file before updating its digest')
        temporary.chmod(0o644)
        temporary.replace(destination)
        time.sleep(1)
        return {'bytes':size,'sha256':checksum}
    finally:
        if temporary and temporary.exists(): temporary.unlink()


def download_asset(asset, directory):
    for attempt in range(3):
        try:
            return _download_original(asset,directory)
        except HTTPError as error:
            if error.code not in {429,500,502,503,504} or attempt==2:
                raise
        except (URLError,TimeoutError,ConnectionError):
            if attempt==2:
                raise
        time.sleep(2**attempt)


class Library:
    def __init__(self,catalog_path,directory):
        self.directory=Path(directory).resolve()
        self.data=validate_catalog(json.loads(Path(catalog_path).read_text(encoding='utf-8')))
        self.books={book['id']:book for book in self.data['books']}
        self._verified={}

    def asset(self,bid,kind):
        book=self.books.get(bid)
        asset=book.get('assets',{}).get(kind) if book else None
        if not asset or not asset.get('sha256'):
            return None
        path=(self.directory/asset['filename']).resolve()
        if not path.is_relative_to(self.directory) or not path.is_file():
            return None
        stat=path.stat()
        stamp=(stat.st_mtime_ns,stat.st_size,asset['sha256'])
        cached=self._verified.get(str(path))
        if not cached or cached[0] != stamp:
            with path.open('rb') as stream:
                valid=hashlib.file_digest(stream,'sha256').hexdigest()==asset['sha256']
            self._verified[str(path)]=(stamp,valid)
        if not self._verified[str(path)][1]:
            return None
        return path,asset

    def public(self):
        books=[]
        for book in self.data['books']:
            public={**book,'assets':{}}
            for kind,asset in book['assets'].items():
                available=self.asset(book['id'],kind) is not None
                public['assets'][kind]={**asset,'available':available,
                    'local_url':f"/library-files/{book['id']}/{kind}" if available else None}
            books.append(public)
        return {**self.data,'books':books}


def byte_range(header,size):
    if not header:
        return 0,size-1,False
    match=re.fullmatch(r'bytes=(\d*)-(\d*)',header)
    if not match or not any(match.groups()):
        raise ValueError('Invalid byte range')
    first,last=match.groups()
    if not first:
        length=int(last)
        if not length:raise ValueError('Empty suffix')
        return max(0,size-length),size-1,True
    start=int(first);end=min(int(last),size-1) if last else size-1
    if start>=size or start>end:raise ValueError('Range outside file')
    return start,end,True
