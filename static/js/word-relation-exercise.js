import { phraseSession, readPhraseProgress } from './verb-phrase-exercise.js';

export const RELATION_PROGRESS_KEY = 'n5-word-relations-v1';
export const RELATION_LABELS = { antonym: 'Антонимы', synonym: 'Близкие значения', paraphrase: 'Через отрицание' };
export const readRelationProgress = readPhraseProgress;

export function selectRelations(relations, progress, { kind = '', status = '', query = '' } = {}) {
  const search = query.trim().toLocaleLowerCase();
  return relations.filter(r => (!kind || r.kind === kind) && (!status || (progress[r.id] || 'new') === status)
    && (!search || [r.context, r.left.written, r.left.reading, r.left.meaning,
      r.right.written, r.right.reading, r.right.meaning].join(' ').toLocaleLowerCase().includes(search)));
}

export function relationSession(relations, random = Math.random) {
  return phraseSession(relations, random).map(relation => ({ relation,
    reverse: relation.kind !== 'paraphrase' && random() < .5 }));
}

export function relationExercise(relation, reverse = false) {
  // A negative paraphrase always asks for the negation of its named base word.
  const flip = reverse && relation.kind !== 'paraphrase';
  const source = flip ? relation.right : relation.left;
  const target = flip ? relation.left : relation.right;
  const variants = [target, ...(target.alternatives || [])];
  const answers = [...new Set(variants.flatMap(v => [v.reading, v.written]))];
  const display = `${target.written}（${target.reading}）`;
  return { kind: 'phrase', source, target, answers, displayAnswers: answers.map(() => display), hint: relation.note,
    instruction: relation.kind === 'antonym' ? 'Напишите антоним в указанном контексте.'
      : relation.kind === 'synonym' ? 'Вспомните второе слово из изученной пары с близким значением.'
      : `Выразите близкую мысль через отрицание «${target.word}». Используйте обычную форму без です.` };
}
