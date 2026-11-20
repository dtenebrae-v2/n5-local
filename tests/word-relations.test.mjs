import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { relationExercise, relationSession, selectRelations, readRelationProgress } from '../static/js/word-relation-exercise.js';
import { checkAnswer, closestAnswer } from '../static/js/conjugation.js';
const data = JSON.parse(readFileSync(new URL('../data/word-relations.json', import.meta.url)));
const words = JSON.parse(readFileSync(new URL('../data/vocabulary.json', import.meta.url))).words;
const relations = data.relations;
const byId = id => relations.find(r => r.id === id);
test('curated relations reference exact word identities and are constrained by a sense/context', () => {
  assert.equal(new Set(relations.map(r => r.id)).size, relations.length);
  for (const r of relations) {
    assert.ok(r.context && r.note);
    for (const side of [r.left,r.right]) {
      const word = words.find(w => w.id === side.word_id);
      assert.equal(side.word,word.kanji);
      assert.ok(word.readings.some(reading => reading.kana === side.word_reading));
    }
    for (const reverse of [false,true]) {
      const exercise = relationExercise(r, reverse);
      for (const answer of exercise.answers) {
        assert.equal(checkAnswer(exercise, answer).status, 'correct', r.id + ' ' + answer);
        assert.ok(closestAnswer(exercise, answer).includes(exercise.target.written));
      }
      assert.equal(checkAnswer(exercise, '全然違う').status, 'incorrect');
    }
  }
});
test('negative paraphrase has its own category and requires the named negative form, not its approximate synonym', () => {
  assert.equal(checkAnswer(relationExercise(byId('antonym-40-675'),true),'よい').status,'correct');
  const dark = byId('paraphrase-223-5');
  assert.equal(dark.right.written,'明るくない');
  assert.equal(relationExercise(dark,true).target.written,'明るくない');
  assert.equal(checkAnswer(relationExercise(dark),'あかるくない').status,'correct');
  assert.equal(checkAnswer(relationExercise(dark),'くらい').status,'incorrect');
  assert.equal(checkAnswer(relationExercise(dark),'あかるい').status,'incorrect');
  for (const [id, answers, wrong] of [
    ['paraphrase-675-40',['よくない','良くない'],'いくない'],
    ['paraphrase-193-764',['きれいじゃない','きれいではない'],'きれくない'],
    ['paraphrase-753-754',['きらいじゃない','嫌いではない'],'きらくない'],
    ['paraphrase-740-759',['ひまじゃない','暇ではない'],'ひまくない']]) {
    for (const answer of answers) assert.equal(checkAnswer(relationExercise(byId(id)),answer).status,'correct');
    assert.equal(checkAnswer(relationExercise(byId(id)),wrong).status,'incorrect');
  }
});
test('polysemous antonyms keep height, price, time and speed separate', () => {
  assert.equal(relationExercise(byId('antonym-704-531')).target.reading,'ひくい');
  assert.equal(relationExercise(byId('antonym-704-732')).target.reading,'やすい');
  assert.equal(relationExercise(byId('antonym-105-514')).target.written,'早い');
  assert.equal(relationExercise(byId('antonym-105-515')).target.written,'速い');
  assert.equal(checkAnswer(relationExercise(byId('antonym-704-531')),'やすい').status,'incorrect');
});
test('study filters, saved marks and randomized directions preserve the chosen relation category', () => {
  const first = relations[0];
  const progress = readRelationProgress(JSON.stringify({[first.id]:'known',other:'known'}), relations);
  assert.deepEqual(progress,{[first.id]:'known'});
  assert.deepEqual(readRelationProgress('null',relations),{});
  assert.deepEqual(readRelationProgress('oops',relations),{});
  assert.equal(selectRelations(relations,progress,{status:'known'}).length,1);
  const paraphrases = selectRelations(relations,progress,{kind:'paraphrase'});
  assert.ok(paraphrases.length > 0);
  assert.ok(relationSession(paraphrases,()=>.2).every(task => !task.reverse && task.relation.kind === 'paraphrase'));
  const session = relationSession(relations,()=>.2);
  assert.equal(session.length,10);
  assert.equal(new Set(session.map(t => t.relation.id)).size,10);
  assert.ok(selectRelations(relations,progress,{query:'あかるくない'}).some(r => r.id === 'paraphrase-223-5'));
  assert.equal(selectRelations(relations,progress,{query:'no-match'}).length,0);
});
