export const PHRASE_PROGRESS_KEY = 'n5-verb-phrases-v1';
export const phraseText = phrase => phrase.prefix + phrase.verb;
export const phraseReading = phrase => phrase.prefix_reading + phrase.verb_reading;

export function phraseExercise(phrase, mode = 'full') {
  const verbs = [...new Set([phrase.verb_reading, phrase.verb, ...(phrase.verb_variants || [])])];
  const answers = mode === 'verb' ? verbs
    : [...new Set([phrase.prefix, phrase.prefix_reading])].flatMap(prefix => verbs.map(verb => prefix + verb));
  const display = mode === 'verb'
    ? `${phrase.verb}（${phrase.verb_reading}）` : `${phraseText(phrase)}（${phraseReading(phrase)}）`;
  return { kind: 'phrase', answers: [...new Set(answers)], displayAnswers: answers.map(() => display),
  hint: phrase.note || 'Запомните сочетание целиком вместе с частицами.' };
}

export function readPhraseProgress(raw, phrases) {
  const progress = {};
  try {
    const parsed = JSON.parse(raw);
    for (const phrase of phrases) {
      if (['learning', 'known'].includes(parsed?.[phrase.id])) progress[phrase.id] = parsed[phrase.id];
    }
  } catch { /* A damaged or unavailable record starts a new study history. */ }
  return progress;
}

export function selectPhrases(phrases, progress, { topic = '', status = '', query = '' } = {}) {
  const text = query.trim().toLocaleLowerCase();
  return phrases.filter(p => (!topic || p.topic === topic)
    && (!status || (progress[p.id] || 'new') === status)
    && (!text || [phraseText(p), phraseReading(p), p.meaning, p.verb_meaning].join(' ').toLocaleLowerCase().includes(text)));
}

export function phraseSession(phrases, random = Math.random) {
  const pool = [...phrases];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, 10);
}
