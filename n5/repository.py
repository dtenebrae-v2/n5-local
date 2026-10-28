"""Validated vocabulary snapshot with indexes for collections and groups.

The editable JSON is loaded once. Requests only read precomputed records; no
runtime matching, file writes or per-request database connections are needed.
"""
from copy import deepcopy

from n5.vocabulary import load


class VocabularyRepository:
    def __init__(self, vocabulary, collections):
        document = load(vocabulary, {item['id'] for item in collections})
        self._words = {word['id']: word for word in document['words']}
        self._groups = {group['id']: group for group in document['groups']}
        self._collections = {item['id']: [] for item in collections}
        self._group_entries = {group: [] for group in self._groups}
        self._entries = []
        for word in document['words']:
            for membership in word['memberships']:
                row = self._entry(word, membership)
                collection = membership['collection']
                self._collections[collection].append(row)
                if membership['group'] is not None:
                    self._group_entries[membership['group']].append(row)
                if membership is word['memberships'][0]:
                    self._entries.append(row)
        ranks = {group: rank for rank, group in enumerate(self._groups)}
        for collection, entries in self._collections.items():
            if collection != 'complete':
                entries.sort(key=lambda row: (ranks[row['group_id']], row['id']))
            else:
                entries.sort(key=lambda row: row['id'])
        self._entries.sort(key=lambda row: row['id'])
        for entries in self._group_entries.values():
            entries.sort(key=lambda row: row['id'])

    def _related_groups(self, word):
        groups = {}
        for target in [word, *(self._words[key] for key in word['related_words'])]:
            for membership in target['memberships']:
                if membership['collection'] != 'complete' and membership['group']:
                    group = self._groups[membership['group']]
                    groups[group['id']] = {'id': group['id'], 'name': group['name']}
        return list(groups.values())

    def _entry(self, word, membership):
        group = self._groups.get(membership['group'])
        collection = membership['collection']
        row = {
            'id': word['id'],
            'collection': collection,
            'group_id': membership['group'], 'group_name': group['name'] if group else '',
            'kanji': word['kanji'], 'furigana': ' / '.join(r['kana'] for r in word['readings']),
            'romaji': ' / '.join(r['romaji'] for r in word['readings']),
            'meaning': '; '.join(word['meanings']['en']), 'type': word['verb_type'],
            'context': word['context'], 'vocabulary_task': word.get('vocabulary_task'),
            'source_url': next((s for s in word['sources'] if s.endswith('/' + collection)),
                               next(iter(word['sources']), '')),
            'readings': word['readings'], 'meanings': word['meanings'],
            'related_groups': self._related_groups(word),
        }
        return row

    def _matching(self, params):
        collection = params.get('collection', [''])[0]
        group = params.get('group', [''])[0]
        if group:
            metadata = self._groups.get(group)
            if metadata is None:
                return []
            if collection and metadata['collection'] != collection:
                return []
            else:
                candidates = self._group_entries[group]
        else:
            candidates = self._collections.get(collection, []) if collection else self._entries
        query = params.get('q', [''])[0].strip()[:200].casefold()
        if query:
            return [row for row in candidates if any(query in str(row[field]).casefold()
                    for field in ['kanji', 'furigana', 'romaji', 'meaning'])]
        return candidates

    def count(self, collection=None):
        return len(self._collections.get(collection, [])) if collection else len(self._entries)

    def groups(self, collection=None):
        return [{**group, 'count': len(self._group_entries[group['id']])}
                for group in self._groups.values()
                if collection is None or group['collection'] == collection]

    def words(self, params, *, paginate=True):
        rows = self._matching(params)
        if not paginate:
            return deepcopy(rows)
        limit = max(1, min(200, int(params.get('limit', ['60'])[0])))
        offset = max(0, int(params.get('offset', ['0'])[0]))
        return {'total': len(rows), 'limit': limit, 'offset': offset,
                'entries': deepcopy(rows[offset:offset + limit])}
