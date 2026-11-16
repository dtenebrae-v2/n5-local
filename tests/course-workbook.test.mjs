import test from 'node:test';
import assert from 'node:assert/strict';
import { checkWorkbookAnswer, restoreWorkbookState } from '../static/js/course-workbook.js';
import { resolveRoute } from '../static/js/router.js';

const items = [{id:'0-kana-1',unit:'0',kind:'kana',answers:['かわいい'],script:'hiragana'},
  {id:'0-kana-2',unit:'0',kind:'kana',answers:['カメラ'],script:'katakana'},
  {id:'17-translation-1',unit:'17',kind:'translation',answer:'例です。'}];

test('kana grading preserves the requested script, romaji and explicit alternatives', () => {
  assert.equal(checkWorkbookAnswer(items[0],'kawaii'),true);
  assert.equal(checkWorkbookAnswer(items[0],'KAWAII'),true);
  assert.equal(checkWorkbookAnswer(items[0],'カワイイ'),false);
  assert.equal(checkWorkbookAnswer(items[1],'kamera'),true);
  assert.equal(checkWorkbookAnswer(items[1],'ｶﾒﾗ'),true);
  assert.equal(checkWorkbookAnswer(items[1],'かめら'),false);
  assert.equal(checkWorkbookAnswer(items[0],'かわい'),false);
  assert.equal(checkWorkbookAnswer({answers:['よじさんじゅっぷん','よじはん']},'よじはん'),true);
  assert.equal(checkWorkbookAnswer(items[2],'another valid translation'),null);
});

test('drafts, independent self-check results and filters survive restore without invented scores', () => {
  const state=restoreWorkbookState({answers:{'17-translation-1':{value:'Мой ответ',status:'self-review',revealed:true,first:'answer'},
    '0-kana-1':{value:'かわい',status:'review',revealed:true,first:'review'},unknown:{status:'correct'}},
    units:{'17':4,'0':2},filters:{'0':'kana'}},items);
  assert.equal(state.answers['17-translation-1'].value,'Мой ответ');
  assert.equal(state.answers['17-translation-1'].status,'self-review');
  assert.equal(state.answers['0-kana-1'].first,'review');
  assert.equal(state.units['17'],4);
  assert.equal(state.filters['0'],'kana');
  assert.equal(state.answers.unknown,undefined);
  assert.equal(restoreWorkbookState(null,items).units['17'],undefined);
  const broken=restoreWorkbookState({units:{'0':-1},answers:{'0-kana-1':{status:'forged',value:42}},filters:{'0':'invalid'}},items);
  assert.equal(broken.answers['0-kana-1'].status,null);
  assert.equal(broken.answers['0-kana-1'].value,'');
  assert.equal(broken.filters['0'],undefined);
  assert.equal(resolveRoute('/jlpt/n5/course/workbook',{base:'/jlpt/n5'}).type,'course-workbook');
});
