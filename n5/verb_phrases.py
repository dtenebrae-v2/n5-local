"""Curated collocations, matched to the current editable vocabulary by identity."""
import json


def load_phrases(path):
    data = json.loads(path.read_text(encoding='utf-8'))
    seen = set()
    for phrase in data['phrases']:
        if phrase['word_id'] in seen:
            raise ValueError('Duplicate verb phrase')
        seen.add(phrase['word_id'])
        for key in ('verb', 'verb_reading', 'prefix', 'prefix_reading', 'meaning', 'topic'):
            if not isinstance(phrase[key], str) or not phrase[key].strip():
                raise ValueError(f'Invalid phrase {phrase["id"]}: {key}')
    return data


def public_phrases(data, entries):
    verbs = {entry['id']: entry for entry in entries if entry['type']}
    phrases = []
    for phrase in data['phrases']:
        word = verbs.get(phrase['word_id'])
        if word and word['kanji'] == phrase['verb'] and any(
                reading['kana'] == phrase['verb_reading'] for reading in word['readings']):
            phrases.append({**phrase, 'verb_meaning': word['meaning_ru'] or word['meaning']})
    covered = {phrase['word_id'] for phrase in phrases}
    return {'phrases': phrases, 'total_verbs': len(verbs), 'sources': data['sources'],
            'uncovered': [{'id': word['id'], 'kanji': word['kanji'], 'reading': word['furigana']}
                          for key, word in verbs.items() if key not in covered]}
