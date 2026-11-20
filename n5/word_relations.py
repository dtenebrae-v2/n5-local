"""Sense-specific vocabulary relations and approximate negative paraphrases."""
import json


def load_relations(path):
    data = json.loads(path.read_text(encoding='utf-8'))
    seen = set()
    for relation in data['relations']:
        if relation['id'] in seen or relation['kind'] not in {'synonym', 'antonym', 'paraphrase'}:
            raise ValueError('Invalid or duplicate word relation')
        seen.add(relation['id'])
        for key in ('context', 'note'):
            if not isinstance(relation[key], str) or not relation[key].strip():
                raise ValueError(f'Invalid relation {relation["id"]}: {key}')
        for name in ('left', 'right'):
            side = relation[name]
            if type(side['word_id']) is not int or side['word_id'] < 1:
                raise ValueError('Invalid relation word ID')
            for key in ('word', 'word_reading', 'written', 'reading', 'meaning'):
                if not isinstance(side[key], str) or not side[key].strip():
                    raise ValueError(f'Invalid relation side: {key}')
            for answer in [side, *side.get('alternatives', [])]:
                if not answer['written'] or not all('ぁ' <= ch <= 'ゖ' or ch == 'ー' for ch in answer['reading']):
                    raise ValueError('Relation answers must have written form and hiragana reading')
    return data


def public_relations(data, entries):
    words = {word['id']: word for word in entries}
    def matches(side):
        word = words.get(side['word_id'])
        return word and word['kanji'] == side['word'] and any(
            r['kana'] == side['word_reading'] for r in word['readings'])
    relations = [r for r in data['relations'] if matches(r['left']) and matches(r['right'])]
    return {'relations': relations, 'sources': data['sources'],
            'unavailable': len(data['relations']) - len(relations)}
