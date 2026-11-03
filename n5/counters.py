"""Validated counter reference and explicitly accepted readings."""
import json
import re


def load_counters(path):
    data = json.loads(path.read_text(encoding='utf-8'))
    if data.get('version') != 1 or not data.get('counters'):
        raise ValueError('Invalid counters catalog')
    ids = set()
    for counter in data['counters']:
        for key in ('id', 'symbol', 'label', 'rule', 'reading', 'forms', 'sources'):
            if not counter.get(key):
                raise ValueError(f'Missing counter field: {key}')
        if counter['id'] in ids:
            raise ValueError('Duplicate counter')
        ids.add(counter['id'])
        numbers = set()
        for form in counter['forms']:
            number = form['number']
            if type(number) is not int or number < 1 or number in numbers:
                raise ValueError('Invalid or duplicate counter number')
            numbers.add(number)
            if not form.get('written') or not form.get('readings') or len(set(form['readings'])) != len(form['readings']):
                raise ValueError('Invalid counter answer')
            if any(not re.fullmatch(r'[ぁ-ゖー]+', value) for value in form['readings']):
                raise ValueError('Counter readings must be hiragana')
        if any(not source.get('title') or not source.get('url', '').startswith('https://') for source in counter['sources']):
            raise ValueError('Invalid counter source')
    return data
