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
  assert.match(homePage(catalog,storage({preparation})),/href="\/jlpt\/n5\/course\?lesson=17">Продолжить/);
  preparation.session.lesson='review-20';
  assert.match(homePage(catalog,storage({preparation})),/href="\/jlpt\/n5\/course\/reviews\?lesson=review-20">Продолжить/);
});

test('empty home offers a ten-question lesson and useful destinations', () => {
  const html = homePage(catalog, storage());
  assert.match(html, /href="\/jlpt\/n5\/course\?lesson=1">Начать урок 1/);
  assert.match(html, /home-empty-progress/);
  assert.doesNotMatch(html, /home-progress-title/);
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
  assert.match(html, /href="\/jlpt\/n5\/preparation\?quick=1">Смешанная тренировка/);
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
    assert.match(homePage(catalog, store), /Начать урок 1/);
  }
});

test('incomplete saved session metadata still renders a recommendation', () => {
  const preparation = emptyProgress();
  preparation.session = {};
  assert.match(homePage(catalog, storage({preparation})), /Начать урок 1/);
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
  assert.match(html, /<h2>Слушать<\/h2>/);
  assert.match(html, />Письменный пробник →/);
});

test('saved reading and workbook links appear only for unfinished work', () => {
  const values = {
    'n5.library.v1': {version:1,books:{reader:{updated:123,page:2},finished:{updated:124,completed:true}}},
    'n5.workbooks.v1': {books:{textbook:{session:{keys:['a','b'],index:1}}}},
  };
  const html = homePage(catalog,{getItem:key => JSON.stringify(values[key] ?? null)});
  assert.match(html, /href="\/jlpt\/n5\/library\/reader">Продолжить/);
  assert.match(html, /href="\/jlpt\/n5\/workbooks\/textbook\?resume=1">Продолжить/);
  assert.doesNotMatch(html, /library\/finished/);
});

test('learning home includes progress summary and a single detailed results link', () => {
  const html = homePage(catalog,storage());
  assert.match(html, /home-empty-progress/);
  assert.match(html, /После первых занятий/);
  assert.equal((html.match(/href="\/jlpt\/n5\/progress"/g)||[]).length,1);
  assert.match(html, />Подробные результаты →/);
});


test('completed course recommends the next lesson without displacing saved work', () => {
  const preparation = emptyProgress();
  preparation.session = {questions:[{id:'q'}],index:1,lesson:'4'};
  const html = homePage({...catalog,courseLessons:[{number:5,title:'Группы глаголов'}]},storage({preparation}));
  assert.match(html, /course\?lesson=5/);
  assert.match(html, /Группы глаголов/);
  assert.equal((html.match(/class="primary home-cta"/g)||[]).length,1);
});

// The dashboard projects each activity's own saved state; it never writes to those stores.
import {learningOverview, overviewCards, resumeLinks} from '../static/js/learning-overview.js';
function overviewStorage(values) {
  return {getItem:key=>JSON.stringify(values[key]??null),setItem:()=>assert.fail('Overview must not change stored progress')};
}
test('all activity stores expose resumable positions without a combined score',()=>{
  const prep=emptyProgress();prep.session={questions:[{},{}],index:1,lesson:'12'};
  const saved={
    [PREPARATION_KEY]:prep,
    'n5.training.v1':{...trainingSession(false),stats:{a:{correct:3,incorrect:2}},session:{...trainingSession(false).session,answered:2}},
    'n5.library.v1':{version:1,books:{book:{updated:10,page:7,totalPages:18},done:{updated:20,page:5,completed:true}}},
    'n5.workbooks.v1':{books:{'intensive-n5':{session:{keys:['a','b','c'],index:1,title:'Аудирование',answers:{a:{status:'ungraded'}}},records:{x:{status:'correct'},y:{status:'incorrect'}}}}},
    'n5.exam-sets.v1':{sessions:{'n5-2017':{keys:['q1','q2'],index:1,mode:'exam',finished:false},mixed:{keys:['q3'],index:0,mode:'practice'}},records:{q1:{status:'correct'},q2:{status:'ungraded'}}},
    'n5-course-workbook-v1':{units:{17:3},filters:{17:'translation'},answers:{a:{status:'self-correct'},b:{status:'review'}}},
    'n5.audio.v1':{queue:['track1','track2'],index:1,positions:{track2:125}},
    'n5.mock.v1':{exam:{phase:'active',section:0,index:1,sections:[{questions:[{},{}]}]}},
  };
  const result=learningOverview(overviewStorage(saved),'/jlpt/n5',100,{libraryBooks:[{id:'book',title:'鏡のない村'}]});
  const byId=Object.fromEntries(result.resumptions.map(item=>[item.id,item]));
  assert.equal(byId.preparation.href,'/jlpt/n5/course?lesson=12');
  assert.match(byId.preparation.position,/2 из 2/);
  assert.equal(byId['reading:book'].title,'Чтение · 鏡のない村');
  assert.match(byId['reading:book'].position,/страница 7 из 18/);
  assert.equal(byId['reading:done'],undefined);
  assert.equal(byId['workbook:intensive-n5'].href,'/jlpt/n5/workbooks/intensive-n5?resume=1');
  assert.match(byId['workbook:intensive-n5'].position,/Аудирование · задание 2 из 3/);
  assert.equal(byId['exam:n5-2017'].href,'/jlpt/n5/exams/n5-2017?resume=1');
  assert.equal(byId['exam:mixed'].href,'/jlpt/n5/exams?resume=mixed');
  assert.equal(byId['course-workbook:17'].href,'/jlpt/n5/course/workbook?lesson=17');
  assert.match(byId['course-workbook:17'].position,/карточка 4/);
  assert.match(byId.audio.position,/запись 2 из 2 · 2:05/);
  assert.match(byId.mock.position,/блок 1 · вопрос 2 из 2/);
  assert.ok(result.sections.find(s=>s.id==='forms').summary.includes('Ответов: 5. Верных: 3.'));
  assert.ok(result.sections.find(s=>s.id==='workbooks').summary.includes('Без оценки в сохранённом занятии: 1.'));
  assert.ok(result.sections.find(s=>s.id==='course-workbook').summary.includes('Самопроверка — получилось: 1'));
  assert.equal(result.score,undefined);
  assert.equal(result.percentage,undefined);
  assert.ok(result.resumptions.every(item=>item.reason));
});

test('completed sessions and invalid positions do not become resume commands',()=>{
  const result=learningOverview(overviewStorage({
    'n5.workbooks.v1':{books:{done:{session:{keys:['a'],index:1}},negative:{session:{keys:['a'],index:-1}}}},
    'n5.exam-sets.v1':{sessions:{done:{keys:['a'],index:0,finished:true}}},
    'n5-course-workbook-v1':{units:{1:-1,2:'3'}},
    'n5.audio.v1':{queue:['a'],index:4},
  }));
  assert.equal(result.resumptions.length,0);
});

test('review projection keeps due work and nearest future review separate',()=>{
  const prep=emptyProgress();prep.skills={due:{due:100,needsPractice:true},later:{due:500},latest:{due:900}};
  const result=learningOverview(overviewStorage({[PREPARATION_KEY]:prep}),'/jlpt/n5',200);
  assert.deepEqual(result.review,{due:1,mistakes:1,nextDue:500});
});

test('malformed optional records cannot break the learning home',()=>{
  const prep=emptyProgress();prep.skills={bad:null};prep.topics={bad:{recent:'invalid'}};prep.exams=[null,{total:-1}];
  const values={[PREPARATION_KEY]:prep,'n5.exam-sets.v1':{sessions:[]},'n5-course-workbook-v1':{units:null},'n5.audio.v1':{queue:null}};
  assert.doesNotThrow(()=>learningOverview(overviewStorage(values)));
  assert.doesNotThrow(()=>homePage(catalog,overviewStorage(values)));
});

test('dashboard text escapes saved titles and routes encode stored identifiers',()=>{
  const result=learningOverview(overviewStorage({'n5.library.v1':{version:1,books:{'book/?':{page:2,updated:1}}}}),'/jlpt/n5',1,{libraryBooks:[{id:'book/?',title:'<script>alert(1)</script>'}]});
  const html=resumeLinks(result)+overviewCards(result);
  assert.match(html,/library\/book%2F%3F/);
  assert.match(html,/&lt;script&gt;/);
  assert.doesNotMatch(html,/<script>/);
});


test('a future review remains visible without other saved activity',()=>{
  const prep=emptyProgress();prep.skills={later:{due:Date.now()+86400000}};
  assert.match(homePage(catalog,storage({preparation:prep})),/Ближайшее повторение:/);
});


test('overview includes phrase marks, relation marks and saved counter session',()=>{
 const overview=learningOverview(overviewStorage({'n5-verb-phrases-v1':{one:'known',two:'learning'},'n5-word-relations-v1':{one:'learning'},'n5.counters.v1':{session:{keys:['one','two'],position:1,answers:{one:{status:'correct'}}}}}));
 assert.match(overview.sections.find(s=>s.id==='phrases').summary,/Знаю: 1/);
 assert.match(overview.sections.find(s=>s.id==='relations').summary,/Изучаю: 1/);
 assert.equal(overview.resumptions.find(s=>s.id==='counters').position,'задание 2 из 2');
});
