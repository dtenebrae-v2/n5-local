"""Apply bundled vocabulary additions without replacing a user's dictionary."""
import copy

from n5.vocabulary import load, read_json, validate, write_document


def apply_updates(data_directory, path):
    if path.resolve() == (data_directory / 'vocabulary.json').resolve():
        return
    manifest_path = data_directory / 'vocabulary-updates.json'
    if not manifest_path.exists():
        return
    collections = {c['id'] for c in read_json(data_directory / 'catalog.json')['collections']}
    document = load(path, collections)
    bundled = load(data_directory / 'vocabulary.json', collections)
    manifest = read_json(manifest_path)
    by_id = {word['id']: word for word in bundled['words']}
    changed = False
    for correction in manifest['replace']:
        replacement = by_id[correction['id']]
        for word in document['words']:
            if all(word[key] == value for key, value in correction['before'].items()):
                for key in correction['before']:
                    word[key] = copy.deepcopy(replacement[key])
                word['sources'] = list(dict.fromkeys(word['sources'] + replacement['sources']))
                changed = True

    def identity(word):
        return word['kanji'], tuple(sorted(r['kana'] for r in word['readings'])), word['verb_type']

    existing = {identity(word) for word in document['words']}
    used_ids = {word['id'] for word in document['words']}
    next_id = max(used_ids | by_id.keys(), default=0) + 1
    for word_id in manifest['add']:
        word = by_id[word_id]
        if identity(word) in existing:
            continue
        word = copy.deepcopy(word)
        if word['related_words']:
            raise ValueError('Bundled additions with related words require explicit ID remapping')
        if word['id'] in used_ids:
            word['id'] = next_id
            next_id += 1
        document['words'].append(word)
        used_ids.add(word['id'])
        existing.add(identity(word))
        changed = True
    bundled_tasks = {identity(w): w for w in bundled['words'] if 'vocabulary_task' in w}
    for word in document['words']:
        task = bundled_tasks.get(identity(word))
        if task and task['meanings'] == word['meanings'] and 'vocabulary_task' not in word:
            word['vocabulary_task'] = copy.deepcopy(task['vocabulary_task'])
            changed = True
    if changed:
        validate(document, collections)
        write_document(path, document)
