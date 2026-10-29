import test from 'node:test';
import assert from 'node:assert/strict';
import { loadProgress, saveProgress, recordAttempt, teGroup } from '../static/js/training-progress.js';

test('Progress survives storage, separates exercises and records hint/skip/error', () => {
  let json;
  const storage = { getItem: () => json, setItem: (_, value) => { json = value; } };
  const data = loadProgress(storage);
  const card = { word: { entry: { id: 1, kanji: '行く', meaning: 'to go' }, collection: 'verbs', kind: 'verb' }, form: 'te' };
  recordAttempt(data, card, 'incorrect', 'いきて', 'いって');
  recordAttempt(data, { ...card, form: 'past' }, 'answer', '', 'いきました');
  recordAttempt(data, { ...card, form: 'negative' }, 'skip', '', 'いきません');
  assert.ok(saveProgress(data, storage));
  const restored = loadProgress(storage);
  assert.equal(Object.keys(restored.mistakes).length, 3);
  recordAttempt(restored, card, 'correct', 'いって', 'いって');
  assert.equal(Object.keys(restored.mistakes).length, 2);
  assert.equal(restored.stats['1:te'].incorrect, 1);
  assert.equal(restored.stats['1:te'].correct, 1);
});
test('Unavailable and malformed browser storage do not prevent practice', () => {
  assert.deepEqual(loadProgress({ getItem: () => '{broken' }).mistakes, {});
  assert.equal(saveProgress({}, { setItem: () => { throw Error('full'); } }), false);
});
test('Te filters distinguish Godan endings, Ichidan and exceptions', () => {
  const word = (kana, type) => ({ kind: 'verb', entry: { readings: [{ kana }], type } });
  assert.equal(teGroup(word('いく', 'Godan')), 'iku');
  assert.equal(teGroup(word('かく', 'Godan')), 'ite');
  assert.equal(teGroup(word('およぐ', 'Godan')), 'ide');
  assert.equal(teGroup(word('かえる', 'Godan')), 'tte');
  assert.equal(teGroup(word('たべる', 'Ichidan')), 'ichidan');
  assert.equal(teGroup(word('くる', 'Irregular')), 'irregular');
});

test('A correct answer with a hint is separate from errors', () => {
  const progress = loadProgress({ getItem: () => null });
  const card = { word: { entry: { id: 1, kanji: '行く' }, collection: 'verbs', kind: 'verb' }, form: 'te' };
  recordAttempt(progress, card, 'incorrect', 'いきて', 'いって');
  recordAttempt(progress, card, 'hinted', 'いって', 'いって');
  assert.equal(Object.keys(progress.mistakes).length, 0);
  assert.equal(progress.stats['1:te'].hinted, 1);
  assert.equal(progress.stats['1:te'].correct, 0);
});
