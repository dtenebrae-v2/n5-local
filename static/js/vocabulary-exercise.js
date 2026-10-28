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

export function vocabularyExercise(entry) {
  const task = entry.vocabulary_task;
  const explicit = task?.answers.map(a => ({ kanji: a.kanji, readings: [{ kana: a.kana }] }));
  const accepted = explicit || [entry];
  const answers = [...new Set(accepted.flatMap(readingsOf))];
  const displayAnswers = [...new Set(accepted.map(item => {
    const readings = [...new Set(readingsOf(item))];
    if (!readings.length) return null;
    const reading = readings.join(' / ');
    return item.kanji && item.kanji !== reading ? `${item.kanji}（${reading}）` : reading;
  }).filter(Boolean))];
  return answers.length ? { kind: 'vocabulary', form: 'vocabulary', answers, displayAnswers, prompt: task?.prompt || entry.meaning } : null;
}
