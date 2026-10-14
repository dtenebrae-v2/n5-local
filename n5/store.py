"""Serialized vocabulary additions and consistent snapshots for HTTP readers."""
import shutil
import os
import tempfile
from pathlib import Path
from threading import Lock
import unicodedata

from n5.catalog import Catalog
from n5.repository import VocabularyRepository
from n5.vocabulary import add_word


class WordError(ValueError):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


def required_text(value, label, maximum):
    if not isinstance(value, str) or not value.strip():
        raise WordError(f'Заполните поле «{label}».')
    value = unicodedata.normalize('NFC', value.strip())
    if len(value) > maximum or any(ord(char) < 32 for char in value):
        raise WordError(f'Недопустимое значение поля «{label}».')
    return value


def word_from_form(payload, catalog):
    required = {'kanji', 'readings', 'meanings', 'collection', 'group'}
    if not isinstance(payload, dict) or not required <= payload.keys() <= required | {'context', 'source'}:
        raise WordError('Заполните написание, чтение, ромадзи, перевод, раздел и группу.')
    collection = payload['collection']
    if not isinstance(collection, str) or collection not in {c['id'] for c in catalog.public['collections']}:
        raise WordError('Выберите раздел.')
    group_id = payload['group']
    groups = catalog.repository.groups(collection)
    group = next((g for g in groups if g['id'] == group_id), None)
    if collection != 'complete' and group is None:
        raise WordError('Выберите группу выбранного раздела.')
    if collection == 'complete' and group_id is not None:
        raise WordError('Для общего словаря группа не требуется.')
    readings = payload['readings']
    if not isinstance(readings, list) or not 1 <= len(readings) <= 10:
        raise WordError('Добавьте хотя бы одно чтение (не более 10).')
    normalized_readings = []
    for reading in readings:
        if not isinstance(reading, dict) or set(reading) != {'kana', 'romaji'}:
            raise WordError('Для каждого чтения заполните кану и ромадзи.')
        kana = required_text(reading['kana'], 'Чтение', 200)
        romaji = required_text(reading['romaji'], 'Ромадзи', 200)
        if not all('\u3040' <= ch <= '\u30ff' or ch in ' 、。！？!?〜~（）' for ch in kana):
            raise WordError('В чтении используйте хирагану или катакану.')
        if not all(ch.isascii() or 'LATIN' in unicodedata.name(ch, '') for ch in romaji):
            raise WordError('Ромадзи нужно записать латиницей.')
        normalized_readings.append({'kana': kana, 'romaji': romaji})
    if collection == 'verbs':
        for reading in normalized_readings:
            kana = ''.join(chr(ord(ch) - 0x60) if 'ァ' <= ch <= 'ヶ' else ch for ch in reading['kana'])
            valid = (group['name'] == 'Godan' and kana.endswith(tuple('うくぐすつぬぶむる'))
                     or group['name'] == 'Ichidan' and kana.endswith('る')
                     or group['name'] == 'Irregular' and kana in {'する', 'くる'})
            if not valid:
                raise WordError('Чтение не соответствует типу спряжения. Для неправильных глаголов поддерживаются する и くる.')
    meanings = payload['meanings']
    if not isinstance(meanings, list) or not 1 <= len(meanings) <= 20:
        raise WordError('Добавьте перевод (не более 20 значений).')
    memberships = [{'collection': 'complete', 'group': None}]
    if collection != 'complete':
        memberships.append({'collection': collection, 'group': group_id})
    context = payload.get('context', '')
    source = payload.get('source', '')
    if not isinstance(context, str) or not isinstance(source, str):
        raise WordError('Пример и источник должны быть текстом.')
    return {
        'kanji': required_text(payload['kanji'], 'Написание', 200),
        'readings': normalized_readings,
        'meanings': {'en': [required_text(m, 'Перевод', 500) for m in meanings]},
        'memberships': memberships,
        'verb_type': group['name'] if collection == 'verbs' else None,
        'context': required_text(context, 'Пример / пояснение', 2000) if context.strip() else None,
        'sources': [required_text(source, 'Источник', 1000)] if source.strip() else [],
        'related_words': [], 'notes': [],
    }


class VocabularyStore:
    def __init__(self, data_directory, path):
        self.data_directory = data_directory
        self.path = Path(path)
        self.lock = Lock()
        if not self.path.exists():
            self.path.parent.mkdir(parents=True, exist_ok=True)
            temporary = None
            try:
                with tempfile.NamedTemporaryFile(dir=self.path.parent, delete=False) as output:
                    temporary = output.name
                    with (data_directory / 'vocabulary.json').open('rb') as source:
                        shutil.copyfileobj(source, output)
                    output.flush()
                    os.fsync(output.fileno())
                os.replace(temporary, self.path)
            finally:
                if temporary and Path(temporary).exists():
                    Path(temporary).unlink()
        self.catalog = self._load()

    def _load(self):
        return Catalog(self.data_directory, lambda collections: VocabularyRepository(self.path, collections))

    def add(self, payload):
        with self.lock:
            word = word_from_form(payload, self.catalog)
            try:
                word_id = add_word(self.path, word, {c['id'] for c in self.catalog.public['collections']})
            except ValueError as error:
                if 'duplicate word' in str(error):
                    raise WordError('Такое слово с этим чтением и переводом уже есть в словаре.', 409) from error
                raise WordError('Проверьте поля: чтения и переводы не должны повторяться, источник должен быть ссылкой http(s).') from error
            self.catalog = self._load()
            return {'id': word_id, 'kanji': word['kanji'], 'collection': payload['collection'],
                    'catalog': self.catalog.public}
