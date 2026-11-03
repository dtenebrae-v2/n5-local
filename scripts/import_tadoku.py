#!/usr/bin/env python3
"""Import reviewed level 1–2 originals for a personal, noncommercial Tadoku library."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import os
from pathlib import Path
import sys
import time
from urllib.request import Request, urlopen, build_opener, HTTPRedirectHandler
from urllib.robotparser import RobotFileParser
from urllib.error import HTTPError, URLError

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from n5.tadoku import approved_url, candidates, parse_book, parse_narrators, TERMS, AUDIO_SOURCE

MATERIALS = Path(os.environ.get('N5_MATERIALS_DIR', ROOT/'data/materials'))
CACHE = Path('/tmp/n5-tadoku-import')
AGENT = 'N5Local-PersonalLibrary/1.0'


class SameOriginRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        approved_url(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def fetch(url, limit=4000000):
    approved_url(url)
    for attempt in range(3):
        try:
            with build_opener(SameOriginRedirect()).open(Request(url, headers={'User-Agent':AGENT}), timeout=60) as response:
                data=response.read(limit+1)
                if len(data)>limit:
                    raise ValueError('Response exceeds size limit')
                return data
        except HTTPError as error:
            if error.code not in {429,500,502,503,504} or attempt==2:
                raise
        except (URLError,TimeoutError,ConnectionError):
            if attempt==2:
                raise
        time.sleep(2**attempt)


def page(url):
    CACHE.mkdir(parents=True, exist_ok=True)
    path = CACHE / (hashlib.sha256(url.encode()).hexdigest()+'.html')
    if not path.exists():
        data=fetch(url)
        path.write_bytes(data)
        time.sleep(1)
    return path.read_text(encoding='utf-8')


def scan(limit=None):
    robots = RobotFileParser()
    robots.parse(fetch('https://tadoku.org/robots.txt').decode().splitlines())
    source='https://tadoku.org/japanese/free-books/'
    if not robots.can_fetch(AGENT, source):
        raise ValueError('Catalogue crawling is disallowed by robots.txt')
    listing=page(source)
    narrators=parse_narrators(page(AUDIO_SOURCE))
    options=candidates(listing)
    priority={'61371':0,'5883':1,'64329':2}
    options.sort(key=lambda item:(priority.get(item['url'].strip('/').split('/')[-1],3),not item['has_audio']))
    books=[]
    unavailable=[]
    quotas={1:(limit+1)//2,2:limit//2} if limit is not None else None
    for item in options:
        if limit is not None and len(books)>=limit:
            break
        if quotas and sum(book['level']==item['level'] for book in books)>=quotas[item['level']]:
            continue
        url=item['url']
        if not robots.can_fetch(AGENT,url):
            continue
        try:
            book=parse_book(page(url),url,narrators)
            books.append(book)
            print(f"CATALOG {book['id']} level {book['level']} {book['title']}",flush=True)
        except OSError as exc:
            unavailable.append(url)
            print(f'UNAVAILABLE {url}: {exc}',file=sys.stderr,flush=True)
        except ValueError as exc:
            print(f'SKIP {url}: {exc}',file=sys.stderr,flush=True)
    if unavailable and limit is None:
        raise RuntimeError('Incomplete catalogue scan; retry unavailable pages: '+', '.join(unavailable))
    return {'version':1,'usage':'personal-noncommercial','terms':TERMS,'books':books}


def download(asset, directory):
    from n5.library import download_asset
    return download_asset(asset,directory)


def write_catalog(path,catalog):
    temporary=path.with_suffix('.tmp')
    temporary.write_text(json.dumps(catalog,ensure_ascii=False,indent=2)+'\n')
    temporary.replace(path)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--scan',action='store_true',help='Refresh the reviewed level 1–2 catalogue')
    parser.add_argument('--download',action='store_true',help='Download original files without modification')
    selection=parser.add_mutually_exclusive_group()
    selection.add_argument('--limit',type=int,help='Optional balanced subset; by default import all eligible books')
    selection.add_argument('--all',action='store_true',help='Import every eligible level 1–2 book without quotas')
    parser.add_argument('--directory',type=Path,default=MATERIALS/'tadoku/files')
    args=parser.parse_args()
    if args.limit is not None and not 1<=args.limit<=100:
        parser.error('--limit must be between 1 and 100')
    path=MATERIALS/'tadoku/catalog.json'
    catalog=scan(args.limit) if args.scan else json.loads(path.read_text())
    if args.scan and path.exists():
        previous=json.loads(path.read_text())
        known={(asset['url'],asset['filename']):asset for book in previous['books'] for asset in book['assets'].values()}
        for book in catalog['books']:
            for asset in book['assets'].values():
                old=known.get((asset['url'],asset['filename']),{})
                for field in ['bytes','sha256']:
                    if field in old:asset[field]=old[field]
    from n5.library import validate_catalog
    validate_catalog(catalog)
    if args.scan:
        write_catalog(path,catalog)
    if args.download:
        assets=[(book,kind,asset) for book in catalog['books'] for kind,asset in book['assets'].items()]
        with ThreadPoolExecutor(max_workers=2) as executor:
            # Bounded concurrency; only original URLs from the reviewed catalogue.
            futures=[executor.submit(download,asset,args.directory) for _,_,asset in assets]
            failed=False
            for (book,kind,asset),future in zip(assets,futures):
                try:
                    info=future.result();asset.update(info)
                    print(f"SAVED {book['id']} {kind}: {info['bytes']} bytes",flush=True)
                except Exception as exc:
                    failed=True;print(f"FAILED {book['id']} {kind}: {exc}",file=sys.stderr,flush=True)
        write_catalog(path,catalog)
        if failed:
            raise SystemExit(1)


if __name__=='__main__':
    main()
