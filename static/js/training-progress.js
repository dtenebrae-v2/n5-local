const KEY = 'n5.training.v1';

export function loadProgress(storage) {
  try {
    const data = JSON.parse((storage || localStorage).getItem(KEY));
    if (data?.version === 1 && data.mistakes && typeof data.mistakes === 'object' && !Array.isArray(data.mistakes)) {
      data.mistakes = Object.fromEntries(Object.entries(data.mistakes).filter(([, a]) => a && Number.isInteger(a.id) && typeof a.form === 'string'));
      if (data.session && (!Array.isArray(data.session.deck) || !Array.isArray(data.session.retry) || !Array.isArray(data.session.attempts))) data.session = null;
      return data;
    }
  } catch { /* A blocked or cleared browser store must not prevent practice. */ }
  return { version: 1, mistakes: {}, session: null, settings: {} };
}

export function saveProgress(data, storage) {
  try { (storage || localStorage).setItem(KEY, JSON.stringify(data)); return true; }
  catch { return false; }
}

export function exerciseKey(card) { return `${card.word.entry.id}:${card.form}`; }

export function recordAttempt(progress, card, status, answer, expected) {
  const attempt = {
    id: card.word.entry.id, collection: card.word.collection, kind: card.word.kind || null,
    form: card.form, status, answer, expected, word: card.word.entry.kanji,
    meaning: card.word.entry.meaning,
  };
  const key = exerciseKey(card);
  progress.stats ||= {};
  const stats = progress.stats[key] ||= { correct: 0, incorrect: 0, answer: 0, skip: 0 };
  stats[status] = (stats[status] || 0) + 1;
  stats.lastReviewed = new Date().toISOString();
  if (status === 'correct') delete progress.mistakes[key];
  else progress.mistakes[key] = attempt;
  return attempt;
}

export const TE_GROUPS = {
  all: 'Все правила', tte: 'う・つ・る → って', nde: 'ぬ・ぶ・む → んで',
  ite: 'く → いて', ide: 'ぐ → いで', shite: 'す → して',
  ichidan: 'Ichidan · る → て', irregular: 'する・くる', iku: '行く → 行って',
};

export function teGroup(word) {
  if (word.kind !== 'verb') return null;
  const reading = word.entry.readings[0].kana;
  if (word.entry.type === 'Irregular') return 'irregular';
  if (word.entry.type === 'Ichidan') return 'ichidan';
  if (reading === 'いく') return 'iku';
  const end = reading.at(-1);
  return 'うつる'.includes(end) ? 'tte' : 'ぬぶむ'.includes(end) ? 'nde'
    : end === 'く' ? 'ite' : end === 'ぐ' ? 'ide' : end === 'す' ? 'shite' : null;
}
