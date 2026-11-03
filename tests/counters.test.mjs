import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { counterPool, counterExercise, counterSession, restoreCounterSession } from '../static/js/counter-exercise.js';
import { checkAnswer, closestAnswer } from '../static/js/conjugation.js';
const data = JSON.parse(readFileSync(new URL('../data/counters.json', import.meta.url)));
const pool = counterPool(data.counters, data.counters.map(counter => counter.id));
test('Essential has exactly the 17 selected counters', () => {
  assert.deepEqual(data.counters.map(c => c.symbol), ['歳','羽','冊','杯','日','枚','階','時','頭','本','台','分','ヶ月','人','匹','回','年']);
  assert.equal(new Set(pool.map(item => item.key)).size, pool.length);
  for (const item of pool) for (const reading of item.form.readings) {
    assert.equal(checkAnswer(counterExercise(item), reading).status, 'correct');
    assert.ok(closestAnswer(counterExercise(item), reading).includes(item.form.written));
  }
});
test('exceptional readings, dates and durations stay distinct', () => {
  const exercise = key => counterExercise(pool.find(item => item.key === key));
  for (const [key, answer] of [['age:20','はたち'],['dates:1','ついたち'],['dates:24','にじゅうよっか'],['people:4','よにん'],['hours:9','くじ'],['months:6','ろっかげつ'],['floors:3','さんがい'],['floors:3','さんかい'],['minutes:4','よんぷん'],['minutes:4','よんふん'],['birds:3','さんば']]) assert.equal(checkAnswer(exercise(key), answer).status, 'correct');
  for (const [key, answer] of [['dates:1','いちにち'],['times:3','さんがい'],['months:4','しがつ'],['people:4','よんにん']]) assert.equal(checkAnswer(exercise(key), answer).status, 'incorrect');
});
test('a session contains distinct exercises from only selected counters', () => {
  const subset = counterPool(data.counters, ['books']);
  const session = counterSession(subset, 20, () => .5);
  assert.equal(session.keys.length, 10);
  assert.equal(new Set(session.keys).size, 10);
  assert.ok(session.keys.every(key => key.startsWith('books:')));
  session.answers[session.keys[0]] = {first:'incorrect',status:'correct',value:'いっさつ',assisted:false};
  session.position = 1;
  assert.equal(restoreCounterSession(session, pool).answers[session.keys[0]].first, 'incorrect');
  assert.equal(restoreCounterSession({...session,keys:['unknown:1']}, pool), null);
  assert.equal(restoreCounterSession({...session,position:100}, pool), null);
  assert.equal(restoreCounterSession({...session,keys:[session.keys[0],session.keys[0]]}, pool), null);
});
