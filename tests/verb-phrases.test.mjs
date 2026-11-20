import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { phraseExercise, phraseReading, phraseText, readPhraseProgress, selectPhrases, phraseSession } from '../static/js/verb-phrase-exercise.js';
import { checkAnswer, closestAnswer } from '../static/js/conjugation.js';
const data = JSON.parse(readFileSync(new URL('../data/verb-phrases.json', import.meta.url)));
const vocabulary = JSON.parse(readFileSync(new URL('../data/vocabulary.json', import.meta.url)));
const phrases = data.phrases;
test('every verb identity, including homonyms and course extras, has a collocation', () => {
  assert.deepEqual(phrases.map(p => p.word_id).sort((a,b) => a-b), vocabulary.words.filter(w => w.verb_type).map(w => w.id).sort((a,b) => a-b));
  for (const p of phrases) {
    const word = vocabulary.words.find(w => w.id === p.word_id);
    assert.equal(p.verb, word.kanji);
    assert.ok(word.readings.some(r => r.kana === p.verb_reading));
    assert.match(phraseReading(p), /^[ぁ-ゖー]+$/u);
  }
  assert.equal(phraseReading(phrases.find(p => p.word_id === 1171)), 'きにいる');
  assert.notEqual(phrases.find(p => p.word_id === 65).meaning, phrases.find(p => p.word_id === 66).meaning);
});
test('whole phrases and verb cloze accept kana, written and mixed scripts with meaningful feedback', () => {
  for (const p of phrases) for (const mode of ['full', 'verb']) {
    const exercise = phraseExercise(p, mode);
    for (const answer of exercise.answers) {
      assert.equal(checkAnswer(exercise, answer).status, 'correct', answer);
      assert.ok(closestAnswer(exercise, answer).includes(mode === 'verb' ? p.verb : phraseText(p)));
    }
    assert.equal(checkAnswer(exercise, '間違い').status, 'incorrect');
  }
  const p = phrases.find(p => p.word_id === 8);
  const exercise = phraseExercise(p);
  for (const answer of ['まどがあける', 'まどをしめる', '窓を閉める', 'あける', '']) assert.equal(checkAnswer(exercise, answer).status, 'incorrect');
  assert.equal(checkAnswer(exercise, 'madowoakeru').status, 'correct');
  assert.equal(checkAnswer(exercise, 'まどをあけr').status, 'incomplete');
});
test('study history validates input, filters independently and limits randomized practice', () => {
  const first = phrases[0];
  const progress = readPhraseProgress(JSON.stringify({ [first.id]: 'known', bad: 'known', [phrases[1].id]: 'bogus' }), phrases);
  assert.deepEqual(progress, { [first.id]: 'known' });
  assert.deepEqual(readPhraseProgress('{bad', phrases), {});
  assert.deepEqual(readPhraseProgress('null', phrases), {});
  assert.equal(selectPhrases(phrases, progress, { status: 'known' }).length, 1);
  assert.equal(selectPhrases(phrases, progress, { query: 'まどをあける' })[0].word_id, 8);
  assert.ok(selectPhrases(phrases, progress, {topic:'Дом'}).every(p => p.topic === 'Дом'));
  const session = phraseSession(phrases, () => .5);
  assert.equal(session.length, 10);
  assert.equal(new Set(session).size, 10);
  assert.equal(phraseSession([first]).length, 1);
});
