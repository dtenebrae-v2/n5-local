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

test('course links and saved lesson sessions open their dedicated sections', () => {
  assert.deepEqual(resolveRoute('/jlpt/n5/course',catalog),{type:'course',title:'Уроки N5',view:'lessons'});
  assert.deepEqual(resolveRoute('/jlpt/n5/course/reviews',catalog),{type:'course',title:'Повторение по урокам',view:'reviews'});
  const preparation=emptyProgress();
  preparation.session={questions:[{id:'q'}],index:0,lesson:'17'};
  assert.match(homePage(catalog,storage({preparation})),/href="\/jlpt\/n5\/course">Продолжить/);
  preparation.session.lesson='review-20';
  assert.match(homePage(catalog,storage({preparation})),/href="\/jlpt\/n5\/course\/reviews">Продолжить/);
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


test('home recommends due review before mistakes and preserves resume priority', () => {
  const preparation = emptyProgress();
  preparation.skills = {a:{needsPractice:true,due:1}};
  let html = homePage(catalog, storage({preparation}));
  assert.match(html, /<h2>Повторение на сегодня<\/h2>/);
  preparation.session = {questions:[{id:1}],index:0};
  html = homePage(catalog, storage({preparation}));
  assert.doesNotMatch(html, /<h2>Повторение на сегодня<\/h2>/);
  assert.match(html, /Продолжить · задание 1 из 1/);
});

test('home distinguishes listening from written practice and reports actual results', () => {
  const preparation = emptyProgress();
  preparation.exams = [{total:49,correct:31}];
  const html = homePage(catalog, storage({preparation}));
  assert.match(html, /Последний письменный пробник: 31 из 49/);
  assert.match(html, /<h2>Аудирование<\/h2>/);
  assert.match(html, />Письменный пробник →/);
});

test('saved reading and workbook links appear only for unfinished work', () => {
  const values = {
    'n5.library.v1': {version:1,books:{reader:{updated:123,page:2},finished:{updated:124,completed:true}}},
    'n5.workbooks.v1': {books:{textbook:{session:{keys:['a','b'],index:1}}}},
  };
  const html = homePage(catalog,{getItem:key => JSON.stringify(values[key] ?? null)});
  assert.match(html, /href="\/jlpt\/n5\/library\/reader">Продолжить чтение/);
  assert.match(html, /href="\/jlpt\/n5\/workbooks\/textbook">Продолжить упражнения/);
  assert.doesNotMatch(html, /library\/finished/);
});

test('learning home includes progress summary and a single detailed results link', () => {
  const html = homePage(catalog,storage());
  assert.match(html, /Прогресс и повторение/);
  assert.match(html, /После первых занятий/);
  assert.equal((html.match(/href="\/jlpt\/n5\/progress"/g)||[]).length,1);
  assert.match(html, />Подробные результаты →/);
});
