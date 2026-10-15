"""Canonical vocabulary validation and atomic addition; standard library only.

Usage: python -m n5.vocabulary validate
       python -m n5.vocabulary add path/to/word.json
"""
import argparse
import copy
import json
import os
from pathlib import Path
import tempfile
import unicodedata
from urllib.parse import urlsplit

DEFAULT_DATA = Path(__file__).resolve().parent.parent / 'data' / 'vocabulary.json'
WORD_FIELDS = {'id', 'kanji', 'readings', 'meanings', 'verb_type', 'context',
               'memberships', 'related_words', 'sources', 'notes'}
VERB_TYPES = {'Godan', 'Ichidan', 'Irregular'}


def require(condition, path, message):
    if not condition:
        raise ValueError(f'{path}: {message}')


def text(value, path, *, empty=False):
    require(isinstance(value, str), path, 'expected a string')
    require((empty or bool(value)) and value == value.strip(), path, 'empty or surrounding whitespace')
    require(unicodedata.normalize('NFC', value) == value, path, 'use Unicode NFC')


def url(value, path, *, empty=False):
    text(value, path, empty=empty)
    if value:
        parts = urlsplit(value)
        require(parts.scheme in {'http', 'https'} and bool(parts.netloc), path, 'expected http(s) URL')


def integer(value, path):
    require(type(value) is int and value > 0, path, 'expected a positive integer')


def keys(value, required, optional, path):
    require(isinstance(value, dict), path, 'expected an object')
    require(required <= value.keys() <= required | optional, path,
            f'fields must be {sorted(required)}; optional: {sorted(optional)}')


def validate(document, collections):
    keys(document, {'schema_version', 'groups', 'words', 'group_sources'}, set(), 'vocabulary')
    require(type(document['schema_version']) is int and document['schema_version'] == 1,
            'schema_version', 'unsupported version')
    for field in ['groups', 'words', 'group_sources']:
        require(isinstance(document[field], list), field, 'expected an array')
    for i, source in enumerate(document['group_sources']):
        path = f'group_sources[{i}]'
        keys(source, {'title', 'url'}, set(), path)
        text(source['title'], path + '.title'); url(source['url'], path + '.url')
    groups = {}
    for i, group in enumerate(document['groups']):
        path = f'groups[{i}]'
        keys(group, {'id', 'collection', 'name', 'description', 'source_url'}, set(), path)
        for field in ['id', 'collection', 'name']:
            text(group[field], path + '.' + field)
        text(group['description'], path + '.description', empty=True)
        url(group['source_url'], path + '.source_url', empty=True)
        require(group['collection'] in collections, path, 'unknown collection')
        require(group['id'].startswith(group['collection'] + ':'), path, 'group ID must start with collection:')
        require(group['id'] not in groups, path, 'duplicate group ID')
        groups[group['id']] = group
    ids, fingerprints = set(), set()
    for i, word in enumerate(document['words']):
        path = f'words[{i}]'
        keys(word, WORD_FIELDS, set(), path)
        integer(word['id'], path + '.id')
        require(word['id'] not in ids, path, 'duplicate word ID')
        ids.add(word['id'])
        text(word['kanji'], path + '.kanji')
        require(word['verb_type'] is None or (isinstance(word['verb_type'], str) and word['verb_type'] in VERB_TYPES), path, 'invalid verb_type')
        if word['context'] is not None:
            text(word['context'], path + '.context')
        for field in ['readings', 'memberships', 'related_words', 'sources', 'notes']:
            require(isinstance(word[field], list), path + '.' + field, 'expected an array')
        require(bool(word['readings']), path, 'at least one reading is required')
        readings = set()
        for reading in word['readings']:
            keys(reading, {'kana', 'romaji'}, set(), path + '.readings')
            for field in reading:
                text(reading[field], path + '.readings.' + field)
                require('/' not in reading[field] and '／' not in reading[field], path, 'put alternate readings in separate objects')
            require(all('\u3040' <= ch <= '\u30ff' or ch in ' 、。！？!?〜~（）' for ch in reading['kana']),
                    path + '.readings.kana', 'expected kana, not kanji or Latin letters')
            pair = (reading['kana'], reading['romaji'])
            require(pair not in readings, path, 'duplicate reading')
            readings.add(pair)
        require(isinstance(word['meanings'], dict) and bool(word['meanings'].get('en')), path, 'English meanings are required')
        for language, meanings in word['meanings'].items():
            text(language, path + '.meanings language')
            require(isinstance(meanings, list) and bool(meanings), path, 'meanings must be non-empty arrays')
            for meaning in meanings:
                text(meaning, path + '.meanings.' + language)
            require(len(meanings) == len(set(meanings)), path, 'duplicate meanings')
        fingerprint = (word['kanji'], tuple(sorted(readings)), json.dumps(word['meanings'], sort_keys=True))
        require(fingerprint not in fingerprints, path, 'duplicate word: add memberships to the existing record')
        fingerprints.add(fingerprint)
        require(bool(word['memberships']), path, 'at least one membership is required')
        member_collections = set()
        for membership in word['memberships']:
            keys(membership, {'collection', 'group'}, set(), path + '.memberships')
            collection = membership['collection']
            text(collection, path + '.memberships.collection')
            require(collection in collections and collection not in member_collections, path, 'unknown or repeated collection')
            member_collections.add(collection)
            group = membership['group']
            require(group is None or isinstance(group, str), path, 'invalid group')
            require((group is None and collection == 'complete') or
                    (group in groups and groups[group]['collection'] == collection), path, 'unknown or incompatible group')
            if collection == 'verbs':
                require(word['verb_type'] in VERB_TYPES and groups[group]['name'] == word['verb_type'], path, 'verb class and group disagree')
        require('nouns' not in member_collections or 'complete' in member_collections, path, 'nouns must also belong to complete')
        require((word['verb_type'] is not None) == ('verbs' in member_collections), path, 'verb_type requires verbs membership and vice versa')
        for source in word['sources']:
            url(source, path + '.sources')
        for note in word['notes']:
            text(note, path + '.notes')
        for related in word['related_words']:
            integer(related, path + '.related_words')
        require(len(word['related_words']) == len(set(word['related_words'])), path, 'duplicate related word')
    for word in document['words']:
        require(all(target in ids and target != word['id'] for target in word['related_words']),
                f"word {word['id']}", 'unknown or self-related word')
    return document


def unique_keys(pairs):
    result = {}
    for key, value in pairs:
        require(key not in result, key, 'duplicate JSON key')
        result[key] = value
    return result


def read_json(path):
    return json.loads(Path(path).read_text(encoding='utf-8'), object_pairs_hook=unique_keys)


def load(path, collections):
    return validate(read_json(path), collections)


def add_word(path, word, collections):
    """Validate everything before an atomic replacement; never renumber existing words."""
    document = load(path, collections)
    require(isinstance(word, dict), 'word', 'expected an object')
    word = copy.deepcopy(word)
    used = [w['id'] for w in document['words']]
    word.setdefault('id', max(used, default=0) + 1)
    for field, default in [('verb_type', None), ('context', None), ('related_words', []), ('sources', []), ('notes', [])]:
        word.setdefault(field, default)
    document['words'].append(word)
    validate(document, collections)
    write_document(path, document)
    return word['id']


def write_document(path, document):
    """Replace a validated dictionary atomically."""
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=Path(path).parent, delete=False) as output:
            temporary = output.name
            json.dump(document, output, ensure_ascii=False, indent=2)
            output.write('\n')
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, path)
    finally:
        if temporary and Path(temporary).exists():
            Path(temporary).unlink()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data', type=Path, default=DEFAULT_DATA)
    sub = parser.add_subparsers(dest='command', required=True)
    sub.add_parser('validate')
    add = sub.add_parser('add')
    add.add_argument('file', type=Path)
    args = parser.parse_args()
    try:
        collections = {c['id'] for c in read_json(args.data.parent / 'catalog.json')['collections']}
        if args.command == 'add':
            print('Added word', add_word(args.data, read_json(args.file), collections))
        else:
            data = load(args.data, collections)
            print(f"OK: {len(data['words'])} words, {len(data['groups'])} groups")
    except (ValueError, OSError) as error:
        parser.exit(1, f'{error}\n')


if __name__ == '__main__':
    main()
