import { VERB_FORM_LABELS } from '../static/js/verb-forms.js';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { checkAnswer, exerciseFor, normalizeAnswer, readingOf } from '../static/js/conjugation.js';

const verb = (reading, type) => ({ kanji: reading, readings: reading.split(/\s*[/／]\s*/).map(kana => ({ kana })), type });
const adjective = (reading) => ({ kanji: reading, readings: reading.split(/\s*[/／]\s*/).map(kana => ({ kana })) });
const fullForms = (entry, kind, form) => {
  const exercise = exerciseFor(entry, kind, form);
  return exercise.answers;
};

test('Godan: all nine endings and ru-verbs that are not Ichidan', () => {
  const cases = [
    ['あう', 'あいました'], ['かく', 'かきました'], ['およぐ', 'およぎました'],
    ['はなす', 'はなしました'], ['まつ', 'まちました'], ['しぬ', 'しにました'],
    ['あそぶ', 'あそびました'], ['のむ', 'のみました'], ['かえる', 'かえりました'],
    ['はいる', 'はいりました'], ['きる', 'きりました'], ['いく', 'いきました'],
  ];
  for (const [reading, expected] of cases) {
    assert.deepEqual(fullForms(verb(reading, 'Godan'), 'verb', 'past'), [expected]);
  }
  assert.deepEqual(fullForms(verb('よむ', 'Godan'), 'verb', 'negative'), ['よみません']);
  assert.deepEqual(fullForms(verb('のむ', 'Godan'), 'verb', 'past_negative'), ['のみませんでした']);
});

test('Ichidan and irregular verbs; do not guess groups from the reading', () => {
  assert.deepEqual(fullForms(verb('たべる', 'Ichidan'), 'verb', 'past'), ['たべました']);
  assert.deepEqual(fullForms(verb('きる', 'Ichidan'), 'verb', 'negative'), ['きません']);
  assert.deepEqual(fullForms(verb('いる', 'Ichidan'), 'verb', 'past_negative'), ['いませんでした']);
  assert.deepEqual(fullForms(verb('する', 'Irregular'), 'verb', 'past'), ['しました']);
  assert.deepEqual(fullForms(verb('くる', 'Irregular'), 'verb', 'negative'), ['きません']);
  assert.deepEqual(fullForms(verb('くる', 'Irregular'), 'verb', 'past_negative'), ['きませんでした']);
  assert.deepEqual(fullForms(verb('いる', 'Godan'), 'verb', 'past'), ['いりました']);
});

test('I-adjective alternatives, ii exception and kawaii is regular', () => {
  assert.deepEqual(fullForms(adjective('おおきい'), 'i-adjective', 'past'), ['おおきかったです']);
  assert.deepEqual(fullForms(adjective('おおきい'), 'i-adjective', 'negative'), ['おおきくないです', 'おおきくありません']);
  assert.deepEqual(fullForms(adjective('おおきい'), 'i-adjective', 'past_negative'), ['おおきくなかったです', 'おおきくありませんでした']);
  for (const reading of ['いい', 'よい', 'よい / いい']) {
    assert.deepEqual(fullForms(adjective(reading), 'i-adjective', 'past'), ['よかったです']);
  }
  assert.deepEqual(fullForms(adjective('いい'), 'i-adjective', 'past_negative'), ['よくなかったです', 'よくありませんでした']);
  assert.deepEqual(fullForms(adjective('かわいい'), 'i-adjective', 'past'), ['かわいかったです']);
  assert.deepEqual(fullForms(adjective('つまらない'), 'i-adjective', 'past'), ['つまらなかったです']);
});

test('Nouns and na-adjectives: all polite copula alternatives without extra na', () => {
  for (const [kind, reading] of [['noun', 'がくせい'], ['na-adjective', 'きれい'], ['na-adjective', 'きらい']]) {
    assert.deepEqual(fullForms(adjective(reading), kind, 'past'), [reading + 'でした']);
    assert.deepEqual(fullForms(adjective(reading), kind, 'negative'), [
      'ではありません', 'じゃありません', 'ではないです', 'じゃないです',
    ].map((ending) => reading + ending));
    assert.deepEqual(fullForms(adjective(reading), kind, 'past_negative'), [
      'ではありませんでした', 'じゃありませんでした', 'ではなかったです', 'じゃなかったです',
    ].map((ending) => reading + ending));
  }
  assert.equal(readingOf(adjective('まじめ')), 'まじめ');
  assert.equal(readingOf(adjective('まいつき/まいげつ')), 'まいつき');
});

test('Romaji, kana, spaces, width, double consonants and final n', () => {
  const cases = [
    ['mashita', 'ました'], ['MASENDESHITA', 'ませんでした'], ['masen', 'ません'],
    ['janakattadesu', 'じゃなかったです'], ['deha arimasen deshita', 'ではありませんでした'],
    ['kimasendeshita', 'きませんでした'], ['kunakattadesu', 'くなかったです'],
    ['ｶｯﾀﾃﾞｽ', 'かったです'], ['ＭＡＳＨＩＴＡ', 'ました'], ['konnichiha', 'こんにちは'],
    ['shinnai', 'しんない'], ['んでした', 'んでした'],
  ];
  for (const [input, expected] of cases) assert.equal(normalizeAnswer(input), expected);
});

test('Validation rejects wrong tense, plain forms, bad kana, punctuation and duplicated stems', () => {
  const exercise = exerciseFor(verb('いく', 'Godan'), 'verb', 'past');
  assert.equal(checkAnswer(exercise, 'ikimashita').status, 'correct');
  assert.equal(checkAnswer(exercise, 'いきました').full, 'いきました');
  for (const answer of ['ます', 'ました', 'きませんでした', 'きました', 'った', 'きました。']) {
    assert.notEqual(checkAnswer(exercise, answer).status, 'correct');
  }
  assert.equal(checkAnswer(exercise, '').status, 'empty');
  assert.equal(checkAnswer(exercise, 'sh').status, 'incomplete');
  assert.equal(checkAnswer(exercise, '<script>').status, 'incomplete');
  const noun = exerciseFor(adjective('がくせい'), 'noun', 'past_negative');
  assert.equal(checkAnswer(noun, 'gakuseidehaarimasendeshita').status, 'correct');
  assert.equal(checkAnswer(noun, 'じゃないでした').status, 'incorrect');
  assert.equal(checkAnswer(noun, 'でわありませんでした').status, 'incorrect');
  assert.equal(exerciseFor(verb('たべる', null), 'verb', 'past'), null);
  assert.equal(exerciseFor(adjective('おはよう'), 'expression', 'past'), null);
});

test('Every supported entry in the bundled dictionary has usable exercises', () => {
  const source = `
import json
from server import CATALOG, REPOSITORY
print(json.dumps([{ 'kind': c['practice_kind'], 'entries': REPOSITORY.words({'collection': [c['id']]}, paginate=False)} for c in CATALOG.public['collections'] if 'practice_kind' in c], ensure_ascii=False))
`;
  const collections = JSON.parse(execFileSync(process.env.PYTHON || 'python3', ['-c', source], {
    cwd: new URL('..', import.meta.url), env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' }, encoding: 'utf8',
  }));
  let count = 0;
  for (const collection of collections) {
    for (const entry of collection.entries) {
      for (const form of ['past', 'negative', 'past_negative', ...(collection.kind === 'verb' ? Object.keys(VERB_FORM_LABELS) : [])]) {
        const exercise = exerciseFor(entry, collection.kind, form);
        assert.ok(exercise, `${entry.id}: ${entry.kanji} ${form}`);
        assert.ok(exercise.answers.every((ending) => /^[ぁ-ゖー]+$/u.test(ending)));
      }
      count++;
    }
  }
  assert.equal(count, 649);
});

test('Loanword long vowels accept romaji vowels and the kana length mark', () => {
  for (const [reading, romaji] of [['コーヒー', 'koohiideshita'], ['スーパー', 'suupaadeshita'], ['パーティー', 'paathiideshita']]) {
    const exercise = exerciseFor(adjective(reading), 'noun', 'past');
    assert.equal(checkAnswer(exercise, romaji).status, 'correct');
    assert.equal(checkAnswer(exercise, reading + 'でした').status, 'correct');
  }
  assert.equal(checkAnswer(exerciseFor(adjective('コーヒー'), 'noun', 'past'), 'kohideshita').status, 'incorrect');
});

test('Vocabulary accepts alternate readings, optional phrases and matching translations', async () => {
  const { vocabularyExercise } = await import('../static/js/vocabulary-exercise.js');
  const japan = { meaning: 'Japan', readings: [{ kana: 'にほん' }, { kana: 'にっぽん' }] };
  assert.equal(checkAnswer(vocabularyExercise(japan), 'nippon').status, 'correct');
  assert.equal(checkAnswer(vocabularyExercise(japan), 'nihon').status, 'correct');
  assert.equal(checkAnswer(vocabularyExercise(japan), 'nihongo').status, 'incorrect');
  const phrase = vocabularyExercise({ meaning: 'You are welcome', readings: [{ kana: '（いいえ）どういたしまして。' }] });
  assert.equal(checkAnswer(phrase, 'douitashimashite').status, 'correct');
  assert.equal(checkAnswer(phrase, 'iiedouitashimashite').status, 'correct');
  const same = [{ meaning: 'zero', readings: [{ kana: 'ゼロ' }] }, { meaning: 'zero', readings: [{ kana: 'れい' }] }];
  assert.equal(checkAnswer(vocabularyExercise(same[0], same), 'rei').status, 'correct');
  assert.equal(checkAnswer(vocabularyExercise({ meaning: 'coffee', readings: [{ kana: 'コーヒー' }] }), 'koohii').status, 'correct');
});
