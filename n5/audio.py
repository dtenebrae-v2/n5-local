"""Full original recordings for independent listening, without exercise state."""

def audio_catalog(exams, workbooks, library):
    tracks = []
    for exam_id, (entry, data, _) in exams.sets.items():
        if not data:
            continue
        for key, asset in data['assets'].items():
            if not asset['mime'].startswith('audio/') or exams.asset(exam_id, key) is None:
                continue
            tracks.append({'id': f'exam:{exam_id}:{key}', 'group': 'exams',
                           'album': 'Экзамены N5', 'title': data['title'],
                           'url': f'/exam-files/{exam_id}/{key}', 'duration': asset.get('duration'),
                           'note': '' if asset.get('matched', True) else 'Запись не сопоставлена с заданиями варианта.'})
    for book_id, (entry, data, _) in workbooks.books.items():
        if not data:
            continue
        for key, asset in data['assets'].items():
            if not asset['mime'].startswith('audio/') or workbooks.asset(book_id, key) is None:
                continue
            units = [unit for unit in data['units'] if unit.get('audio') == key
                     or any(item.get('audio') == key and item['unit'] == unit['id'] for item in data['items'])]
            label = ', '.join(f"Неделя {u['week']} · день {u['day']}" for u in units)
            tracks.append({'id': f'workbook:{book_id}:{key}', 'group': 'workbooks',
                           'album': data['title'], 'title': f"Дорожка {key.removeprefix('Track').lstrip('0') or key}" + (f' · {label}' if label else ''),
                           'url': f'/material-files/{book_id}/{key}', 'duration': None, 'note': ''})
    for book in library.books.values():
        if 'audio' not in book['assets'] or library.asset(book['id'], 'audio') is None:
            continue
        tracks.append({'id': f"book:{book['id']}", 'group': 'books', 'album': 'Книги Tadoku',
                       'title': book['title'], 'url': f"/library-files/{book['id']}/audio",
                       'duration': None, 'note': book['assets']['audio'].get('narrator', '')})
    return {'tracks': tracks}
