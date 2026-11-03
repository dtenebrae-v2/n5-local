"""Private source exam sets, with explicit keys and original media."""
import hashlib
import json
import math
from pathlib import Path
import re


def validate_exam(data):
    if data.get('version') != 1 or not re.fullmatch(r'[a-z0-9-]+', data.get('id', '')):
        raise ValueError('Invalid exam identity')
    assets = data['assets']
    for key, asset in assets.items():
        path = Path(asset['filename'])
        if (not re.fullmatch(r'[a-zA-Z0-9-]+', key) or path.is_absolute() or '..' in path.parts
                or asset['mime'] not in {'image/png', 'audio/ogg'}
                or not re.fullmatch(r'[a-f0-9]{64}', asset['sha256'])):
            raise ValueError('Invalid exam asset')
    ids, families, sections = set(), set(), set()
    for section in data['sections']:
        if section['id'] in sections or not section['pages'] or not section['groups']:
            raise ValueError('Invalid exam section')
        sections.add(section['id'])
        if type(section['seconds']) is not int or section['seconds'] <= 0:
            raise ValueError('Invalid exam duration')
        for key in section['pages'] + section.get('reference', []):
            if key not in assets or assets[key]['mime'] != 'image/png':
                raise ValueError('Missing exam page')
        audio = section.get('audio')
        if audio and (audio not in assets or assets[audio]['mime'] != 'audio/ogg'):
            raise ValueError('Missing exam recording')
        for group in section['groups']:
            if type(group['number']) is not int or group['number'] <= 0:
                raise ValueError('Invalid exam group')
            if not group['items']:
                raise ValueError('Empty exam group')
            for item in group['items']:
                if item['id'] in ids or item['family'] in families:
                    raise ValueError('Duplicate exam question')
                ids.add(item['id']); families.add(item['family'])
                if (type(item['number']) is not int or item['number'] <= 0
                        or item['choices'] not in {3, 4} or not item['pages']
                        or any(key not in section['pages'] for key in item['pages'])):
                    raise ValueError('Invalid exam question')
                if item['correct'] is not None and (type(item['correct']) is not int
                        or item['correct'] not in range(item['choices'])):
                    raise ValueError('Invalid exam key')
                if item['correct'] is not None and not item.get('answer_source'):
                    raise ValueError('Unverified exam key')
                if item.get('clip') is not None:
                    clip = item['clip']
                    if (not audio or len(clip) != 2 or any(type(n) not in {int, float} or not math.isfinite(n) for n in clip)
                            or not 0 <= clip[0] < clip[1] <= assets[audio]['duration']):
                        raise ValueError('Invalid exam audio interval')
    return data


class ExamSets:
    def __init__(self, root):
        self.root = Path(root).resolve()
        self.sets, self._verified = {}, {}
        index = self.root / 'exams.json'
        if not index.exists():
            return
        for entry in json.loads(index.read_text())['sets']:
            path = (self.root / entry['catalog']).resolve()
            if not path.is_relative_to(self.root) or entry['id'] in self.sets:
                raise ValueError('Invalid exam catalog')
            content = validate_exam(json.loads(path.read_text())) if path.is_file() else None
            if content and content['id'] != entry['id']:
                raise ValueError('Exam catalog identity mismatch')
            self.sets[entry['id']] = (entry, content, path.parent)

    def catalog(self):
        result = []
        for entry, data, _ in self.sets.values():
            items = [q for s in data['sections'] for g in s['groups'] for q in g['items']] if data else []
            result.append({k: v for k, v in entry.items() if k != 'catalog'} | {
                'available': data is not None, 'questions': len(items),
                'graded': sum(q['correct'] is not None for q in items),
                'seconds': sum(s['seconds'] for s in data['sections']) if data else 0,
                'audioSeconds': sum(a.get('duration', 0) for a in data['assets'].values() if a.get('matched', True)) if data else 0,
                'incomplete': bool(data.get('unavailableSections')) or any(s.get('missing') for s in data['sections']) if data else False,
            })
        return {'sets': result}

    def public(self, exam_id):
        found = self.sets.get(exam_id)
        if not found or not found[1]:
            return None
        _, data, _ = found
        return {k: v for k, v in data.items() if k not in {'assets', 'sources'}} | {'assets': {
            key: {'url': f'/exam-files/{exam_id}/{key}', 'mime': asset['mime'],
                  'available': self.asset(exam_id, key) is not None,
                  **{k: asset[k] for k in ('width', 'height', 'duration') if k in asset}}
            for key, asset in data['assets'].items()
        }}

    def asset(self, exam_id, key):
        found = self.sets.get(exam_id)
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
