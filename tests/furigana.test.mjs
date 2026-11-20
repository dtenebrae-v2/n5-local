import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { rubyText, rubyDisplay, makeReadingIndex, annotateText } from '../static/js/furigana-core.js';
const plain = html => html.replace(/<r[tp]>.*?<\/r[tp]>/gu,'').replace(/<[^>]+>/gu,'');
test('ruby preserves okurigana, kana particles and compound readings', () => {
  const html = rubyText('窓を開ける','まどをあける');
  assert.equal(plain(html),'窓を開ける');
  assert.match(html,/<ruby>窓<rp>（<\/rp><rt>まど<\/rt>/u);
  assert.match(html,/<rt>あ<\/rt><rp>）<\/rp><\/ruby>ける/u);
  assert.equal(plain(rubyText('お風呂に入る','おふろにはいる')),'お風呂に入る');
  assert.match(rubyText('学校','がっこう'),/<rt>がっこう<\/rt>/u);
  assert.match(rubyText('1冊','いっさつ'),/<ruby>1冊/u);
  assert.match(rubyText('1ヶ月','いっかげつ'),/<rt>いっかげつ<\/rt>/u);
});
test('kana-only words, missing and mismatched readings never gain invented ruby', () => {
  for (const [written,reading] of [['きれい','きれい'],['コーヒー','こーひー'],['食べる','のむ'],['学校',''],['学生に人気がある','がくせいににんきがある']]) assert.ok(!rubyText(written,reading).includes('<ruby>'));
  assert.equal(rubyText('<img src=x onerror=alert(1)>','x'),'&lt;img src=x onerror=alert(1)&gt;');
  assert.equal(rubyText('学校','<script>'),'学校');
});
test('known words are annotated in prose; ambiguous readings and unknown compounds are left intact', () => {
  const index = makeReadingIndex([['学校','がっこう'],['入る','はいる'],['入る','いる'],['日本','にほん'],['時','とき']]);
  assert.match(annotateText('学校に行く。',index),/<rt>がっこう<\/rt>/u);
  assert.equal(annotateText('入る。',index),'入る。');
  assert.equal(annotateText('日本橋',index),'日本橋');
  assert.equal(annotateText('3時',index),'3時');
  assert.equal(plain(annotateText('学校 & <script>',index)),'学校 &amp; &lt;script&gt;');
});
test('answer models retain their explicit readings even when global vocabulary is ambiguous', () => {
  const html = rubyDisplay('入ります（いります）');
  assert.match(html,/<rt>い<\/rt>/u);
  assert.equal(plain(html),'入ります（いります）');
  assert.equal(rubyDisplay('<script>'),'&lt;script&gt;');
});

test('all dictionary entries containing kanji have an aligned authored reading, including suffix notation', () => {
  const words = JSON.parse(readFileSync(new URL('../data/vocabulary.json',import.meta.url))).words;
  for (const word of words.filter(w => /[\p{Script=Han}々]/u.test(w.kanji))) {
    assert.ok(rubyText(word.kanji,word.readings[0].kana).includes('<ruby>'),word.kanji);
  }
});
