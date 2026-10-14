import test from 'node:test';
import assert from 'node:assert/strict';
import { verbForms } from '../static/js/verb-forms.js';
import { exerciseFor, checkAnswer } from '../static/js/conjugation.js';

test('Godan endings and sound changes', () => {
  const cases = [
    ['かう','かわない','かいます','かえば','かおう','かえ','かって','かった'],
    ['かく','かかない','かきます','かけば','かこう','かけ','かいて','かいた'],
    ['およぐ','およがない','およぎます','およげば','およごう','およげ','およいで','およいだ'],
    ['はなす','はなさない','はなします','はなせば','はなそう','はなせ','はなして','はなした'],
    ['まつ','またない','まちます','まてば','まとう','まて','まって','まった'],
    ['しぬ','しなない','しにます','しねば','しのう','しね','しんで','しんだ'],
    ['とぶ','とばない','とびます','とべば','とぼう','とべ','とんで','とんだ'],
    ['のむ','のまない','のみます','のめば','のもう','のめ','のんで','のんだ'],
    ['とる','とらない','とります','とれば','とろう','とれ','とって','とった'],
  ];
  for (const [reading, ...expected] of cases) {
    const { forms } = verbForms(reading, 'Godan');
    assert.deepEqual(['plain_negative','masu','conditional','volitional','imperative','te','plain_past'].map(k => forms[k][0]), expected);
  }
});
test('Ichidan, irregulars and exceptions', () => {
  assert.deepEqual(verbForms('たべる','Ichidan').forms.imperative, ['たべろ','たべよ']);
  assert.deepEqual(verbForms('する','Irregular').forms.imperative, ['しろ','せよ']);
  const kuru = verbForms('くる','Irregular').forms;
  assert.deepEqual([kuru.plain_negative[0],kuru.masu[0],kuru.conditional[0],kuru.imperative[0],kuru.volitional[0]], ['こない','きます','くれば','こい','こよう']);
  assert.deepEqual(verbForms('ある','Godan').forms.plain_negative, ['ない']);
  assert.deepEqual(verbForms('いく','Godan').forms.te, ['いって']);
  assert.deepEqual(verbForms('いく','Godan').forms.plain_past, ['いった']);
  assert.deepEqual(verbForms('くれる','Ichidan').forms.imperative, ['くれ']);
  assert.equal(verbForms('たべる','Unknown'), null);
});
test('Practice shares reference forms and rejects conditional stem as a command', () => {
  const entry = { kanji: '食べる', readings: [{ kana: 'たべる' }], type: 'Ichidan' };
  const exercise = exerciseFor(entry, 'verb', 'imperative');
  assert.equal(checkAnswer(exercise, 'tabere').status, 'incorrect');
  assert.equal(checkAnswer(exercise, 'tabero').status, 'correct');
  assert.equal(checkAnswer(exercise, 'tabeyo').status, 'correct');
  assert.equal(exerciseFor(entry, 'noun', 'imperative'), null);
});
