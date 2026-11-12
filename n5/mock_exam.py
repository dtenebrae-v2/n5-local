import json

TYPES = {'reading-kanji', 'orthography', 'context', 'paraphrase', 'grammar-choice',
         'sentence-order', 'text-grammar', 'reading-text'}


def load_mock_exam(path):
    data = json.loads(path.read_text(encoding='utf-8'))
    passages = {p['id'] for p in data['passages']}
    topics = {t['id'] for t in data['topics']}
    skills = {s['id']: s for s in data['skills']}
    if len(skills) != len(data['skills']) or any(not s.get('label') or not s.get('rule') or not s.get('example') or s.get('topic') not in topics for s in skills.values()):
        raise ValueError('Invalid preparation skill')
    passage_text = {p['id']: p['text'] for p in data['passages']}
    if len(passages) != len(data['passages']) or len(topics) != len(data['topics']):
        raise ValueError('Duplicate mock metadata')
    if any(not p.get('text') or not p.get('translation') for p in data['passages']):
        raise ValueError('Incomplete mock passage')
    ids, signatures = set(), set()
    for item in data['items']:
        if item['id'] in ids:
            raise ValueError('Duplicate mock question')
        ids.add(item['id'])
        choices = item['choices']
        if len(choices) != 4 or len(set(choices)) != 4 or type(item['correct']) is not int or item['correct'] not in range(4):
            raise ValueError('Invalid mock answers')
        if not item.get('prompt') or not item.get('explanation') or not item.get('family'):
            raise ValueError('Incomplete mock question')
        if item.get('passage') and item['passage'] not in passages:
            raise ValueError('Unknown mock passage')
        if item.get('topic') not in topics or item.get('type') not in TYPES or item.get('difficulty') not in {1, 2}:
            raise ValueError('Unknown mock type or topic')
        if not item.get('sources') or any(type(i) is not int or not 0 <= i < len(data['sources']) for i in item['sources']):
            raise ValueError('Invalid mock source')
        if item.get('skill') not in skills:
            raise ValueError('Missing preparation rule or hint')
        if item.get('type') in {'reading-text', 'text-grammar'}:
            if not item.get('evidence') or any(not quote or quote not in passage_text[item['passage']] for quote in item['evidence']):
                raise ValueError('Invalid reading evidence')
            if set(item.get('choiceNotes', {})) != set(choices) or any(not note for note in item['choiceNotes'].values()):
                raise ValueError('Incomplete reading explanation')
        signature = (item['prompt'], item.get('passage'), tuple(sorted(choices)))
        if signature in signatures:
            raise ValueError('Duplicate mock content')
        signatures.add(signature)
    if topics != {q['topic'] for q in data['items']}:
        raise ValueError('Empty preparation topic')
    coverage = data.get('coverage')
    if coverage:
        if set(coverage['topics']) != topics or coverage['minimumIndependentExamples'] < 24:
            raise ValueError('Incomplete N5 teaching scope')
        for topic in topics:
            families = {q['family'] for q in data['items'] if q['topic'] == topic}
            if len(families) < coverage['minimumIndependentExamples']:
                raise ValueError(f'Insufficient independent examples: {topic}')
    return data
