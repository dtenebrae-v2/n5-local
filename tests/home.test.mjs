import test from 'node:test';
import assert from 'node:assert/strict';
import {homePage} from '../static/js/home.js';
import {resolveRoute} from '../static/js/router.js';
import {emptyProgress, PREPARATION_KEY} from '../static/js/preparation-progress.js';

const catalog = {
  base:'/jlpt/n5',
  collections:[{id:'complete', label:'Все слова', path:'/jlpt/n5/vocabulary/complete'}],
  sections:[], lessons:[],
};
function storage({preparation = emptyProgress(), training} = {}) {
  const values = new Map([[PREPARATION_KEY, JSON.stringify(preparation)]]);
  if (training) values.set('n5.training.v1', JSON.stringify(training));
  return {getItem:key => values.get(key) ?? null};
}
const trainingSession = finished => ({
  version:1, mistakes:{},
  session:{current:{id:1}, finished, deck:[], retry:[], attempts:[]},
});

test('empty home offers a ten-question lesson and useful destinations', () => {
  const html = homePage(catalog, storage());
  assert.match(html, /href="\/jlpt\/n5\/preparation\?quick=1">Начать · 10 заданий/);
  assert.match(html, /Ошибки для повторения появятся после занятий/);
  for (const destination of ['vocabulary/complete','practice','library','mock','exams']) {
    assert.ok(html.includes(`href="/jlpt/n5/${destination}"`));
  }
  assert.doesNotMatch(html, /Вернуться к занятию|mode=mistakes|mode=due/);
});

test('active preparation takes resume priority and shows the saved question', () => {
  const preparation = emptyProgress();
  preparation.session = {questions:[{id:1},{id:2},{id:3}], index:1};
  const html = homePage(catalog, storage({preparation, training:trainingSession(false)}));
  assert.match(html, /href="\/jlpt\/n5\/preparation">Продолжить · задание 2 из 3/);
  assert.doesNotMatch(html, /Продолжить слова и формы/);
  assert.match(html, /class="secondary home-cta" href="\/jlpt\/n5\/preparation\?quick=1"/);
});

test('unfinished forms lesson is resumable but finished lessons are not', () => {
  const preparation = emptyProgress();
  preparation.session = {questions:[{id:1}], index:1};
  const active = homePage(catalog, storage({preparation, training:trainingSession(false)}));
  assert.match(active, /href="\/jlpt\/n5\/practice">Продолжить слова и формы/);
  const finished = homePage(catalog, storage({preparation, training:trainingSession(true)}));
  assert.doesNotMatch(finished, /Вернуться к занятию/);
});

test('review links reflect unresolved mistakes and skills due today', () => {
  const preparation = emptyProgress();
  preparation.skills = {
    mistake:{needsPractice:true, due:Date.now()+86400000},
    due:{needsPractice:false, due:1},
    later:{needsPractice:false, due:Date.now()+86400000},
  };
  const html = homePage(catalog, storage({preparation}));
  assert.match(html, /Правил с ошибками: 1/);
  assert.match(html, /К повторению сегодня: 1/);
  assert.match(html, /href="\/jlpt\/n5\/preparation\?mode=mistakes">Повторить ошибки/);
  assert.match(html, /href="\/jlpt\/n5\/preparation\?mode=due">Повторить сегодня/);
});

test('blocked or malformed storage still renders a usable home', () => {
  for (const store of [{getItem:() => '{broken'}, {getItem:() => {throw Error('blocked');}}]) {
    assert.match(homePage(catalog, store), /Начать · 10 заданий/);
  }
});

test('root aliases resolve to home while vocabulary aliases retain the complete list', () => {
  for (const path of ['/', '/jlpt', '/jlpt/', '/jlpt/n5', '/jlpt/n5/']) {
    assert.deepEqual(resolveRoute(path, catalog), {type:'home',title:'Моё обучение',canonical:catalog.base});
  }
  for (const path of ['/jlpt/n5/vocabulary','/jlpt/n5/vocabulary/']) {
    const route = resolveRoute(path, catalog);
    assert.equal(route.type, 'words');
    assert.equal(route.item, catalog.collections[0]);
    assert.equal(route.canonical, '/jlpt/n5/vocabulary/complete');
  }
  assert.equal(resolveRoute('/jlpt/n5/vocabulary/complete', catalog).type, 'words');
  assert.equal(resolveRoute('/missing', catalog).type, 'missing');
});
