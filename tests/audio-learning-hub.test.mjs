import test from 'node:test';
import assert from 'node:assert/strict';
import {audioHubContext,audioHubURL,audioHubModes,buildAudioLearningSources,audioLearningCards} from '../static/js/audio-learning-hub.js';

const tracks=[
  {id:'exam:exam-one:recording',group:'exams',title:'Экзамен 1'},
  {id:'exam:unmatched:recording',group:'exams',title:'Без заданий'},
  {id:'workbook:book-one:Track002',group:'workbooks',title:'Дорожка 2'},
  {id:'workbook:book-one:Track003',group:'workbooks',title:'Дорожка 3'},
  {id:'book:61371',group:'books',title:'鏡のない村'},
];
test('audio hub keeps the source when switching modes and rejects unknown query values',()=>{
  const current=audioHubContext('?mode=practice&source=workbooks');
  assert.deepEqual(current,{mode:'practice',source:'workbooks'});
  const next=audioHubURL('listen',current.source);
  assert.deepEqual(audioHubContext(next.split('?')[1]),{mode:'listen',source:'workbooks'});
  assert.deepEqual(audioHubContext('?mode=exam&source=unknown'),{mode:'listen',source:'all'});
  const markup=audioHubModes('practice','workbooks');
  assert.match(markup,/Слушать записи/);assert.match(markup,/Тренировать аудирование/);
  assert.equal((markup.match(/aria-current="page"/g)||[]).length,1);
  assert.match(markup,/mode=listen&amp;source=workbooks/);
});
test('only matched listening questions with keys and clips become exam practice links',()=>{
  const exams=[
    {id:'exam-one',title:'Экзамен 1',sections:[{id:'vocabulary',audio:'recording',groups:[{items:[{correct:0,clip:[0,5]}]}]},{id:'listening',audio:'recording',groups:[{items:[{correct:0,clip:[0,5]},{correct:null,clip:[5,10]},{correct:1},{clip:[1,2]}]}]}]},
    {id:'unmatched',title:'Не сопоставлено',assets:{recording:{matched:false}},sections:[{id:'listening',audio:'recording',groups:[{items:[{correct:0,clip:[0,5]}]}]}]},
    {id:'missing-audio',sections:[{id:'listening',audio:'missing',groups:[{items:[{correct:0,clip:[0,5]}]}]}]},
  ];
  const sources=buildAudioLearningSources(tracks,{exams});
  assert.equal(sources.length,1);assert.equal(sources[0].count,1);assert.equal(sources[0].graded,1);
  const url=new URL(sources[0].href,'http://localhost');
  assert.equal(url.pathname,'/jlpt/n5/exams/exam-one');
  assert.equal(url.searchParams.get('section'),'listening');
  assert.equal(url.searchParams.get('audio'),'recording');
  assert.equal(url.searchParams.get('mode'),'practice');
});
test('workbook hub derives the actual unit and each audio track without creating exercise data',()=>{
  const workbook={id:'book-one',title:'Учебник',units:[{id:'week6-day3',week:6,day:3,audio:'Track002'}],items:[{id:'a',unit:'week6-day3',kind:'listening',correct:0},{id:'b',unit:'week6-day3',kind:'listening',correct:null},{id:'c',unit:'week6-day3',kind:'listening',audio:'Track003',correct:null}]};
  const original=JSON.stringify(workbook),sources=buildAudioLearningSources(tracks,{workbooks:[workbook]});
  assert.equal(sources.length,2);assert.equal(sources[0].count,2);assert.equal(sources[0].graded,1);
  assert.equal(sources[1].count,1);assert.equal(sources[1].graded,0);
  for(const source of sources){const url=new URL(source.href,'http://localhost');assert.equal(url.searchParams.get('unit'),'week6-day3');assert.equal(url.searchParams.get('section'),'listening');}
  assert.equal(JSON.stringify(workbook),original,'Projection must not mutate the bank');
  const cards=audioLearningCards(sources,'workbooks',tracks);
  assert.match(cards,/без автопроверки/);assert.match(cards,/с проверкой: 1/);
});
test('book audio offers reading without pretending there are test answers',()=>{
  const cards=audioLearningCards([],'books',tracks);
  assert.match(cards,/нет тестовых заданий/);assert.match(cards,/library\/61371\?from=audio/);
  assert.match(cards,/Читать и слушать/);assert.doesNotMatch(cards,/Открыть аудиозадания/);
});
test('catalogue cards preserve escaped source names and do not imply unmapped recordings have quizzes',()=>{
  const empty=audioLearningCards([],'exams',tracks);
  assert.match(empty,/нет сопоставленных аудиозаданий/);assert.doesNotMatch(empty,/exams\/unmatched/);
  const markup=audioLearningCards([{group:'exams',title:'<img src=x>',subtitle:'<b>source</b>',count:1,graded:1,href:'/jlpt/n5/exams/a?x=1&y=2'}]);
  assert.match(markup,/&lt;img/);assert.match(markup,/&amp;y=2/);assert.doesNotMatch(markup,/<img/);
});
