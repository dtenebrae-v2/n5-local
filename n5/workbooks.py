"""Local study workbooks; source content and assets stay outside the image/repository."""
import hashlib
import json
from pathlib import Path
import re


def validate_workbook(data):
    if data.get('version') != 1 or not re.fullmatch(r'[a-z0-9-]+', data.get('id', '')):
        raise ValueError('Invalid workbook identity')
    units = {unit['id'] for unit in data['units']}
    if len(units) != len(data['units']):
        raise ValueError('Duplicate workbook unit')
    ids = set()
    for key, asset in data['assets'].items():
        path = Path(asset['filename'])
        if not re.fullmatch(r'[a-zA-Z0-9-]+', key) or path.is_absolute() or '..' in path.parts:
            raise ValueError('Invalid workbook asset path')
        if asset['mime'] not in {'audio/mpeg', 'image/png'} or not re.fullmatch(r'[a-f0-9]{64}', asset['sha256']):
            raise ValueError('Invalid workbook asset format')
    references = []
    for unit in data['units']:
        references.extend(unit['questions'])
        if unit.get('audio') and unit['audio'] not in data['assets']:
            raise ValueError('Unknown unit audio')
    for item in data['items']:
        if item['id'] in ids or item['unit'] not in units:
            raise ValueError('Invalid workbook question')
        ids.add(item['id'])
        choices = item['choices']
        if not item['prompt'] or len(choices) not in {3, 4} or any(not isinstance(c, str) or not c for c in choices):
            raise ValueError('Invalid workbook choices')
        correct = item['correct']
        if correct is not None and (type(correct) is not int or correct not in range(len(choices))):
            raise ValueError('Invalid workbook answer')
        if not item.get('answer_source'):
            raise ValueError('Missing answer provenance')
        if item.get('target') and item['target'] not in item['prompt']:
            raise ValueError('Question target is missing from prompt')
        if item.get('order') and (sorted(item['order']) != [1, 2, 3, 4] or item['order'][2] - 1 != correct):
            raise ValueError('Incorrect starred answer or fragment order')
        media = item.get('choice_images', []) + [item[k] for k in ('image', 'audio') if item.get(k)]
        if any(key not in data['assets'] for key in media):
            raise ValueError('Unknown question media')
        if item.get('choice_images') and len(item['choice_images']) != len(choices):
            raise ValueError('Choice image count does not match choices')
        if item.get('spoken_choices') and len(item['spoken_choices']) != len(choices):
            raise ValueError('Spoken choice count does not match choices')
    if set(references) != ids or len(references) != len(ids):
        raise ValueError('Workbook questions must belong to exactly one unit')
    for unit in data['units']:
        if any(item['unit'] != unit['id'] for item in data['items'] if item['id'] in unit['questions']):
            raise ValueError('Question assigned to wrong unit')
    return data


class Workbooks:
    def __init__(self, root):
        self.root = Path(root).resolve()
        self.books = {}
        self._verified = {}
        for book in json.loads((self.root / 'workbooks.json').read_text(encoding='utf-8'))['books']:
            path = (self.root / book['catalog']).resolve()
            if not path.is_relative_to(self.root):
                raise ValueError('Workbook catalog outside materials root')
            content = validate_workbook(json.loads(path.read_text(encoding='utf-8'))) if path.is_file() else None
            if content and (content['id'] != book['id'] or content['isbn'] != book['isbn']):
                raise ValueError('Workbook metadata does not match content')
            self.books[book['id']] = (book, content, path.parent)

    def catalog(self):
        return {'books': [{k: v for k, v in book.items() if k != 'catalog'} | {
            'available': content is not None,
            'questions': len(content['items']) if content else 0,
            'audio': sum(a['kind'] == 'audio' for a in content['assets'].values()) if content else 0,
        } for book, content, _ in self.books.values()]}

    def public(self, book_id):
        found = self.books.get(book_id)
        if not found or not found[1]:
            return None
        _, data, _ = found
        assets = {key: {'url': f'/material-files/{book_id}/{key}', 'mime': asset['mime'],
                        'available': self.asset(book_id, key) is not None}
                  for key, asset in data['assets'].items()}
        return {k: data[k] for k in ('id', 'version', 'title', 'year', 'isbn', 'authors', 'publisher', 'units', 'items', 'audio_source')} | {'assets': assets}

    def asset(self, book_id, key):
        found = self.books.get(book_id)
        if not found or not found[1]:
            return None
        _, data, directory = found
        asset = data['assets'].get(key)
        if not asset:
            return None
        path = (directory / asset['filename']).resolve()
        if not path.is_relative_to(directory) or not path.is_file():
            return None
        stat = path.stat()
        stamp = (stat.st_mtime_ns, stat.st_size, asset['sha256'])
        cached = self._verified.get(str(path))
        if not cached or cached[0] != stamp:
            with path.open('rb') as stream:
                valid = hashlib.file_digest(stream, 'sha256').hexdigest() == asset['sha256']
            self._verified[str(path)] = (stamp, valid)
        return (path, asset | {'filename': path.name}) if self._verified[str(path)][1] else None
