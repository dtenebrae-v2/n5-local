"""CSV serialization kept independent of HTTP and database access."""
import csv
import io

FIELDS = [
    'kanji', 'furigana', 'romaji', 'meaning', 'collection',
    'group_name', 'type', 'context', 'source_url',
]


def vocabulary_csv(rows):
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=FIELDS, extrasaction='ignore')
    writer.writeheader()
    for row in rows:
        # Prevent spreadsheet applications from interpreting text as formulas.
        writer.writerow({
            key: "'" + value if isinstance(value, str) and value.startswith(('=', '+', '-', '@')) else value
            for key, value in row.items()
        })
    return '\ufeff' + output.getvalue()
