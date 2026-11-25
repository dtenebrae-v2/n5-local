import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { rubyText, rubyDisplay, makeReadingIndex, annotateText, annotateTokens } from '../static/js/furigana-core.js';
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

test('bundled offline tokenizer reads compounds, inflections and numeric dates without guessing character readings', async () => {
  const root = new URL('../static/vendor/kuromoji-0.1.2/',import.meta.url);
  class XHR {
    open(method,path) { this.path = path; }
    send() {
      const data = readFileSync(new URL('dict/'+this.path.split('/dict/')[1],root));
      this.response = data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength);
      this.status = 200; this.onload();
    }
  }
  const context = {XMLHttpRequest:XHR,setTimeout,clearTimeout}; vm.createContext(context);
  vm.runInContext(readFileSync(new URL('kuromoji.js',root),'utf8'),context);
  const tokenizer = await new Promise((resolve,reject) => context.kuromoji.builder({dicPath:'/dict/'}).build((error,value) => error ? reject(error) : resolve(value)));
  const index = makeReadingIndex([['聴解','ちょうかい'],['3日','みっか'],['橋','はし']]);
  const text = '日本語能力試験の聴解を始めます。3日目の復習です。';
  const html = annotateTokens(text,tokenizer.tokenize(text),index);
  assert.equal(plain(html),text);
  assert.match(html,/<rt>ちょうかい<\/rt>/u); assert.match(html,/<rt>みっか<\/rt>/u);
  assert.ok(!/[\p{Script=Han}]/u.test(html.replace(/<ruby>.*?<\/ruby>/gu,'')),html);
  const sentence = 'お風呂に入る。この道を通って映画館へ行った。';
  const contextual = annotateTokens(sentence,tokenizer.tokenize(sentence),index);
  assert.equal(plain(contextual),sentence);
  assert.match(contextual,/<rt>はい<\/rt>/u);
  assert.match(contextual,/<rt>とお<\/rt>/u);
  assert.match(contextual,/<rt>い<\/rt>/u);
  const voiced = annotateTokens('日本橋', [{surface_form:'日本',reading:'ニホン'},{surface_form:'橋',reading:'バシ'}],index);
  assert.match(voiced,/<rt>ばし<\/rt>/u);
  const dates = annotateTokens('一日かかります。十一月一日に行きます。',tokenizer.tokenize('一日かかります。十一月一日に行きます。'),index);
  assert.equal((dates.match(/<rt>ついたち<\/rt>/gu)||[]).length,1);
  assert.match(dates,/<rt>いち<\/rt>/u);
});
