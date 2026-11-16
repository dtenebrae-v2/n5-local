"""Standalone exercises from a privately imported workbook; no PDF dependency."""
import copy
import hashlib
import json
from pathlib import Path
import re


def validate(data):
    if data.get('version') != 1 or not isinstance(data.get('title'), str):
        raise ValueError('Invalid course workbook')
    units={u['id'] for u in data['units']}
    if len(units)!=len(data['units']) or any(not re.fullmatch(r'(?:\d{1,2}|review-\d+-\d+)',u) for u in units):
        raise ValueError('Invalid workbook units')
    for key,asset in data['assets'].items():
        path=Path(asset['filename'])
        if (not re.fullmatch(r'[a-zA-Z0-9-]+',key) or path.is_absolute() or '..' in path.parts
                or path.suffix!='.png' or not re.fullmatch(r'[a-f0-9]{64}',asset['sha256'])):
            raise ValueError('Invalid workbook image')
    ids=set()
    for item in data['items']:
        if item['id'] in ids or not re.fullmatch(r'[a-z0-9-]+',item['id']) or item['unit'] not in units:
            raise ValueError('Invalid workbook item identity')
        ids.add(item['id'])
        if not item['prompt'] or not item['answer'] or not isinstance(item['answer'],str):
            raise ValueError('Missing workbook prompt or model answer')
        if 'answers' in item and (not item['answers'] or any(not isinstance(a,str) or not a for a in item['answers'])):
            raise ValueError('Invalid accepted workbook answers')
        for key in item.get('images',[])+item.get('answer_images',[]):
            if key not in data['assets']:raise ValueError('Unknown workbook image')
        if any(type(item['source'].get(k)) is not int or not 1<=item['source'][k]<=164 for k in ['page','answer_page']):
            raise ValueError('Invalid workbook source page')
    return data


class CourseWorkbook:
    def __init__(self,root):
        self.root=Path(root).resolve()
        path=self.root/'workbook.json'
        self.data=validate(json.loads(path.read_text(encoding='utf-8'))) if path.is_file() else None

    def public(self):
        if not self.data:return {'available':False,'units':[],'items':[],'assets':{}}
        data=copy.deepcopy(self.data)
        data['available']=True
        data['assets']={key:{'url':f'/course-workbook-files/{key}'} for key in data['assets']}
        return data

    def asset(self,key):
        if not self.data or key not in self.data['assets']:return None
        asset=self.data['assets'][key]
        path=(self.root/asset['filename']).resolve()
        if (not path.is_relative_to(self.root) or not path.is_file()
                or hashlib.sha256(path.read_bytes()).hexdigest()!=asset['sha256']):return None
        return path,asset
