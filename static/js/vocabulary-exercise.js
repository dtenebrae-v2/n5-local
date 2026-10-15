import { normalizeAnswer } from './conjugation.js';

function readingsOf(entry) {
  return entry.readings.flatMap(({ kana }) => {
    const normalized = normalizeAnswer(kana);
    // Parenthesized words in expressions are optional; counters omit the placeholder.
    return [normalized.replace(/[()（）]/g, ''), normalized.replace(/[（(][^）)]*[）)]/g, '')]
      .map(value => value.replace(/[、。！？!?〜~]/g, ''))
      .filter(value => /^[ぁ-ゖー]+$/u.test(value));
  });
}

export function vocabularyExercise(entry, entries = [entry]) {
  const meaning = entry.meaning.trim().toLowerCase().replace(/\s+/g, ' ');
  const equivalent = entries.filter(item => item.meaning.trim().toLowerCase().replace(/\s+/g, ' ') === meaning);
  const answers = [...new Set([entry, ...equivalent].flatMap(readingsOf))];
  const displayAnswers = [...new Set([entry, ...equivalent].map(item => {
    const readings = [...new Set(readingsOf(item))];
    if (!readings.length) return null;
    const reading = readings.join(' / ');
    return item.kanji && item.kanji !== reading ? `${item.kanji}（${reading}）` : reading;
  }).filter(Boolean))];
  return answers.length ? { kind: 'vocabulary', form: 'vocabulary', answers, displayAnswers } : null;
}
