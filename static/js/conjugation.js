import { verbForms, VERB_FORM_LABELS } from './verb-forms.js';
// Polite forms verified against Japan Foundation / TUFS; sources are linked in the practice view.
import { toHiragana } from '../vendor/wanakana-5.3.1.js';

export const FORM_LABELS = {
  past: 'Прошедшее · утверждение',
  negative: 'Настоящее / будущее · отрицание',
  past_negative: 'Прошедшее · отрицание',
};

const NOMINAL_ENDINGS = {
  past: ['でした'],
  negative: ['ではありません', 'じゃありません', 'ではないです', 'じゃないです'],
  past_negative: ['ではありませんでした', 'じゃありませんでした', 'ではなかったです', 'じゃなかったです'],
};
const I_ADJECTIVE_ENDINGS = {
  past: ['かったです'],
  negative: ['くないです', 'くありません'],
  past_negative: ['くなかったです', 'くありませんでした'],
};

export function normalizeAnswer(value) {
  return toHiragana(value.normalize('NFKC').toLowerCase(), { convertLongVowelMark: false })
    .replace(/\s/g, '');
}

export function readingOf(entry) {
  const reading = entry.readings[0].kana;
  return normalizeAnswer(reading);
}

export function exerciseFor(entry, kind, form) {
  if (!Object.hasOwn(FORM_LABELS, form) && !(kind === 'verb' && Object.hasOwn(VERB_FORM_LABELS, form))) return null;
  const reading = readingOf(entry);
  if (!/^[ぁ-ゖー]+$/u.test(reading)) return null;
  let prefix = reading;
  let endings;
  let rule;

  if (kind === 'noun' || kind === 'na-adjective') {
    endings = NOMINAL_ENDINGS[form];
    rule = kind === 'noun'
      ? 'Существительное не изменяется: время и отрицание выражаются связкой после него. Например, 学生でした — «был студентом». Это не форма действия с する.'
      : 'К な-прилагательному добавляется связка; な перед ней не ставится. Даже если слово заканчивается на い (например, きれい), оно не изменяется как い-прилагательное.';
  } else if (kind === 'i-adjective') {
    if (!reading.endsWith('い')) return null;
    prefix = reading === 'いい' ? 'よ' : reading.slice(0, -1);
    endings = I_ADJECTIVE_ENDINGS[form];
    rule = ['いい', 'よい'].includes(reading)
      ? 'У いい / よい особая основа よ: よかったです, よくないです, よくなかったです.'
      : 'Уберите последнее い и добавьте окончание. В прошедшем утверждении — かったです; в отрицании — くないです или くありません; в прошедшем отрицании — くなかったです или くありませんでした.';
  } else if (kind === 'verb') {
    const group = entry.type;
    const conjugation = verbForms(reading, group);
    if (!conjugation) return null;
    const plain = Object.hasOwn(VERB_FORM_LABELS, form);
    prefix = '';
    endings = conjugation.forms[form];
    rule = plain
      ? `${VERB_FORM_LABELS[form]}. Напишите форму целиком. ${form === 'imperative' ? 'Прямой приказ, не вежливая просьба; варианты на よ / せよ имеют книжный оттенок.' : ''}`
      : group === 'Godan' ? `Godan: основа перед ます — ${conjugation.masuStem}. Добавьте ました, ません или ませんでした.`
      : group === 'Ichidan' ? 'Ichidan: уберите конечное る и добавьте ました, ません или ませんでした.'
      : `${reading} — неправильный глагол. Перед окончаниями ます используется ${conjugation.masuStem}.`;

  } else {
    return null;
  }

  return { answers: endings.map(ending => prefix + ending), reading, rule, form, kind };
}

export function checkAnswer(exercise, value) {
  const answer = normalizeAnswer(value);
  if (!answer) return { status: 'empty', answer };
  if (!/^[ぁ-ゖー]+$/u.test(answer)) return { status: 'incomplete', answer };
  return {
    status: exercise.answers.includes(answer) ? 'correct' : 'incorrect',
    answer,
    full: answer,
  };
}
