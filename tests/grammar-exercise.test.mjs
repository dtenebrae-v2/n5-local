import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { grammarWords, grammarQuestion } from '../static/js/grammar-exercise.js';
import { checkAnswer } from '../static/js/conjugation.js';
import { loadProgress, recordAttempt, saveProgress } from '../static/js/training-progress.js';
const data = JSON.parse(fs.readFileSync(new URL('../data/grammar-practice.json', import.meta.url)));
test('Every grammar task has explicit accepted answers and rejects unrelated input', () => {
  for (const word of grammarWords(data)) {
    for (const answer of word.exercise.answers) assert.equal(checkAnswer(word.exercise, answer).status, 'correct', word.entry.id);
    assert.equal(checkAnswer(word.exercise, 'あああ').status, 'incorrect');
    assert.ok(grammarQuestion(word.exercise).includes(word.exercise.task.instruction));
  }
  const school = grammarWords(data).find(w => w.entry.id === 'grammar:school').exercise;
  assert.equal(checkAnswer(school, 'he').status, 'correct');
  assert.equal(checkAnswer(school, 'ni').status, 'correct');
  assert.equal(checkAnswer(school, 'de').status, 'incorrect');
});
test('Grammar mistakes persist separately from word forms and clear on success', () => {
  let json;
  const storage = { getItem: () => json, setItem: (_, value) => json = value };
  const progress = loadProgress(storage);
  const word = grammarWords(data)[0];
  const card = { word, form: word.exercise.form };
  recordAttempt(progress, card, 'incorrect', 'が', 'は');
  saveProgress(progress, storage);
  const restored = loadProgress(storage);
  assert.equal(Object.keys(restored.mistakes).length, 1);
  recordAttempt(restored, card, 'correct', 'は', 'は');
  assert.equal(Object.keys(restored.mistakes).length, 0);
});
