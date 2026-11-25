"""Offline speech transcripts tied to the exact source recording."""
import json
import math
from pathlib import Path


class AudioTranscripts:
    def __init__(self, path):
        path = Path(path)
        data = json.loads(path.read_text(encoding='utf-8')) if path.is_file() else {'version':1, 'tracks':{}}
        if data.get('version') != 1:
            raise ValueError('Unsupported audio transcript version')
        self.tracks = data['tracks']
        for value in self.tracks.values():
            if value['status'] not in {'automatic', 'reviewed'} or not value['segments']:
                raise ValueError('Invalid transcript status or empty recording')
            previous = -1
            for segment in value['segments']:
                start, end = segment['start'], segment['end']
                if (any(type(n) not in {int, float} or not math.isfinite(n) for n in (start, end))
                        or not 0 <= start < end <= value['duration'] + .5
                        or start < previous or not isinstance(segment['text'], str) or not segment['text'].strip()):
                    raise ValueError('Invalid transcript segment')
                previous = start

    def get(self, track_id, sha256):
        value = self.tracks.get(track_id)
        return value if value and value['sha256'] == sha256 else None
