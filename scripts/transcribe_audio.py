"""Generate resumable, local Japanese transcripts for exams and workbooks."""
import argparse
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from n5.exam_sets import ExamSets
from n5.workbooks import Workbooks


def normalize_jlpt_terms(text):
    # Homophones in the standard JLPT opening are otherwise rendered as words
    # which do not name the exam or its listening section.
    return text.replace('調解', '聴解').replace('エヌ語', 'N5').replace('N語の聴解', 'N5の聴解').replace('聴解N語', '聴解N5')


def recordings(materials):
    for label, catalog, entries in [('exam', ExamSets(materials), 'sets'),
                                    ('workbook', Workbooks(materials), 'books')]:
        for book_id, (_, data, _) in getattr(catalog, entries).items():
            if data is None:
                continue
            for key, asset in data['assets'].items():
                if asset['mime'].startswith('audio/'):
                    found = catalog.asset(book_id, key)
                    if found is None:
                        raise ValueError(f'Missing audio: {book_id}/{key}')
                    yield f'{label}:{book_id}:{key}', found[0], asset


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--materials', type=Path, default=ROOT / 'data/materials')
    parser.add_argument('--model', default='small')
    parser.add_argument('--model-cache', default=None)
    parser.add_argument('--threads', type=int, default=6)
    parser.add_argument('--batch-size', type=int, default=8)
    parser.add_argument('--only', default=None, help='Process a single recording ID')
    parser.add_argument('--force', action='store_true', help='Regenerate automatic transcripts, preserving reviewed text')
    args = parser.parse_args()
    from faster_whisper import WhisperModel, BatchedInferencePipeline
    model = WhisperModel(args.model, device='cpu', compute_type='int8',
                         cpu_threads=args.threads, download_root=args.model_cache)
    pipeline = BatchedInferencePipeline(model=model)
    output = args.materials / 'audio/transcripts.json'
    data = json.loads(output.read_text(encoding='utf-8')) if output.exists() else {'version':1, 'tracks':{}}
    # Short tracks first; each result is saved before proceeding to the next file.
    rows = sorted(recordings(args.materials), key=lambda row: row[1].stat().st_size)
    for number, (key, path, asset) in enumerate(rows, 1):
        if args.only and key != args.only:
            continue
        existing = data['tracks'].get(key, {})
        if existing.get('sha256') == asset['sha256'] and (existing.get('status') == 'reviewed' or not args.force):
            print(f'SKIP {key}', flush=True)
            continue
        print(f'[{number}/{len(rows)}] {key}', flush=True)
        segments, info = pipeline.transcribe(str(path), language='ja', task='transcribe',
                                            batch_size=args.batch_size, beam_size=5,
                                            condition_on_previous_text=False,
                                            initial_prompt='日本語能力試験 N5。聴解。問題。',
                                            vad_filter=True, without_timestamps=False)
        result = [{'start':round(s.start, 2), 'end':round(s.end, 2), 'text':normalize_jlpt_terms(s.text.strip())}
                  for s in segments if s.text.strip()]
        result = [s for s in result if s['end'] > s['start']]
        if not result:
            raise ValueError(f'No speech recognized: {key}')
        data['tracks'][key] = {'sha256':asset['sha256'], 'status':'automatic',
                               'model':args.model, 'language':'ja',
                               'normalization':'jlpt-terms',
                               'duration':round(info.duration, 2), 'segments':result}
        output.parent.mkdir(parents=True, exist_ok=True)
        temporary = output.with_suffix('.json.tmp')
        temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        temporary.replace(output)
        print(f'SAVED {key}: {len(result)} segments, {info.duration:.1f}s', flush=True)


if __name__ == '__main__':
    main()
