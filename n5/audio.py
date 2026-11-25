"""Full original recordings for independent listening, without exercise state."""
from urllib.parse import quote

def audio_catalog(exams, workbooks, library, transcripts=None):
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
                           'sha256': asset['sha256'],
                           'family': asset.get('audio_family', f'exam:{exam_id}:{key}'),
                           'note': '' if asset.get('matched', True) else 'Запись не сопоставлена с заданиями варианта.'})
    for book_id, (entry, data, _) in workbooks.books.items():
        if not data:
            continue
        for key, asset in data['assets'].items():
            if not asset['mime'].startswith('audio/') or workbooks.asset(book_id, key) is None:
                continue
            units = [unit for unit in data['units'] if unit.get('audio') == key
                     or any(item.get('audio') == key and item['unit'] == unit['id'] for item in data['items'])]
            label = ', '.join(u['title'] if data.get('groups') else f"Неделя {u['week']} · день {u['day']}" for u in units)
            tracks.append({'id': f'workbook:{book_id}:{key}', 'group': 'workbooks',
                           'album': data['title'], 'title': f"Дорожка {key.removeprefix('Track').lstrip('0') or key}" + (f' · {label}' if label else ''),
                           'url': f'/material-files/{book_id}/{key}', 'duration': asset.get('duration'),
                           'sha256': asset['sha256'], 'note': ''})
    for book in library.books.values():
        if 'audio' not in book['assets'] or library.asset(book['id'], 'audio') is None:
            continue
        tracks.append({'id': f"book:{book['id']}", 'group': 'books', 'album': 'Книги Tadoku',
                       'title': book['title'], 'url': f"/library-files/{book['id']}/audio",
                       'duration': None, 'note': book['assets']['audio'].get('narrator', '')})
    for track in tracks:
        if track['group'] == 'books':
            continue
        transcript = transcripts.get(track['id'], track['sha256']) if transcripts else None
        if transcript and not track['duration']:
            track['duration'] = transcript['duration']
        track['transcript'] = {'available': transcript is not None,
                               'url': '/api/audio-transcript?id=' + quote(track['id'], safe=''),
                               'status': transcript['status'] if transcript else None}
    families = {}
    for track in tracks:
        family = track.get('family', track['id'])
        if family in families:
            message = f"Те же диалоги, что в «{families[family]}». В непрерывной очереди включаются один раз."
            track['note'] = ' '.join(filter(None, [track['note'], message]))
        else:
            families[family] = track['title']
    return {'tracks': tracks}
