import { loadReading, readingState } from './library-progress.js';
import { loadWorkbookProgress } from './workbook-progress.js';
import { loadProgress } from './training-progress.js';
import { loadPreparation, dueSkills, troubleSkills } from './preparation-progress.js';
import { escapeHTML as esc } from './ui.js';

const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const count = value => Number.isInteger(value) && value >= 0 ? value : 0;
const entries = value => Object.entries(object(value));
function read(storage,key) { try { return object(JSON.parse(storage?.getItem(key))); } catch { return {}; } }
const clock = n => `${Math.floor(n/60)}:${String(Math.floor(n%60)).padStart(2,'0')}`;
const bookName = id => ({'somatome-n5-2017':'Sō-matome N5','intensive-n5':'Интенсив N5'}[id] || id);
function statusCounts(records) {
  const values=Object.values(object(records)).filter(record=>record && typeof record==='object');
  return {correct:values.filter(r=>r.status==='correct').length, reviewed:values.filter(r=>['correct','incorrect','unknown','answer','revealed','skip'].includes(r.status)).length, ungraded:values.filter(r=>r.status==='ungraded').length};
}

// Read-only projection of the existing stores. These activities have different scales;
// their results must never be added into a fictional overall JLPT percentage.
export function learningOverview(storage=globalThis.localStorage,base='/jlpt/n5',now=Date.now(),catalog={}) {
  const preparation=loadPreparation(storage), training=loadProgress(storage);
  for(const key of ['questions','skills','topics']) preparation[key]=Object.fromEntries(entries(preparation[key]).filter(([,value])=>value && typeof value==='object' && !Array.isArray(value)));
  for(const topic of Object.values(preparation.topics)) if(!Array.isArray(topic.recent))topic.recent=[];
  const reading=loadReading(storage), workbooks=loadWorkbookProgress(storage);
  const exams=read(storage,'n5.exam-sets.v1'), courseWorkbook=read(storage,'n5-course-workbook-v1'), audio=read(storage,'n5.audio.v1');
  const bookTitles = new Map((Array.isArray(catalog.libraryBooks)?catalog.libraryBooks:[]).map(book=>[String(book.id),book.title]));
  const resumptions=[];
  const add=(id,title,href,position,reason)=>resumptions.push({id,title,href,position,reason});
  const prep=preparation.session;
  if(Array.isArray(prep?.questions) && prep.questions.length && Number.isInteger(prep.index) && prep.index>=0 && prep.index<prep.questions.length) {
    const path=prep.lesson ? String(prep.lesson).startsWith('review-') ? '/course/reviews' : '/course' : '/preparation';
    const query=prep.lesson ? `?lesson=${encodeURIComponent(prep.lesson)}` : '';
    add('preparation',prep.lesson ? `Курс · ${String(prep.lesson).startsWith('review-')?'повторение '+String(prep.lesson).slice(7):'урок '+prep.lesson}` : 'Задания по темам',base+path+query,`задание ${prep.index+1} из ${prep.questions.length}`,'Занятие ещё не завершено.');
  }
  const form=training.session;
  if(form?.current && !form.finished) add('forms','Слова и формы',base+'/practice',`ответов: ${count(form.answered)} · текущая карточка`,'Сохранены текущий вопрос и введённый ответ.');
  for(const [id,saved] of entries(reading.books).sort((a,b)=>(Number(b[1]?.updated)||0)-(Number(a[1]?.updated)||0))) {
    const state=readingState(reading,id);
    if(!state.completed && (state.updated || state.page>1)) add('reading:'+id,'Чтение · '+(bookTitles.get(id)||('книга № '+id)),base+'/library/'+encodeURIComponent(id),`страница ${state.page}${state.totalPages ? ' из '+state.totalPages : ''}`,'Сохранены страница и положение текста.');
  }
  for(const [id,book] of entries(workbooks.books)) {
    const s=book?.session;
    if(Array.isArray(s?.keys) && s.keys.length && Number.isInteger(s.index) && s.index>=0 && s.index<s.keys.length)
      add('workbook:'+id,'Учебный набор · '+bookName(id),base+'/workbooks/'+encodeURIComponent(id)+'?resume=1',`${typeof s.title==='string' ? s.title+' · ' : ''}задание ${s.index+1} из ${s.keys.length}`,'Незавершённое занятие по учебнику.');
  }
  for(const [id,s] of entries(exams.sessions)) {
    if(Array.isArray(s?.keys) && s.keys.length && Number.isInteger(s.index) && s.index>=0 && s.index<s.keys.length && !s.finished)
      add('exam:'+id,id==='mixed'?'Смешанная экзаменационная тренировка':'Экзаменационный вариант · '+id,id==='mixed'?base+'/exams?resume=mixed':base+'/exams/'+encodeURIComponent(id)+'?resume=1',`задание ${s.index+1} из ${s.keys.length}${s.mode==='exam'?' · с таймером':''}`,s.mode==='exam'?'Сохранены ответы и текущий раздел. Таймер экзамена продолжает идти.':'Сохранены ответы и текущий вопрос тренировки.');
  }
  for(const [unit,position] of entries(courseWorkbook.units)) {
    if(Number.isInteger(position) && position>=0) add('course-workbook:'+unit,unit==='0'?'Тетрадь · вводный урок':unit.startsWith('review-')?'Тетрадь · повторение после урока '+unit.slice(7):'Тетрадь · урок '+unit,base+'/course/workbook?lesson='+encodeURIComponent(unit),`карточка ${position+1}`,'Сохранены карточка, фильтр и черновик.');
  }
  const mock=read(storage,'n5.mock.v1'), mockSession=mock.exam;
  if(mockSession && ['active','between'].includes(mockSession.phase) && Array.isArray(mockSession.sections) && Number.isInteger(mockSession.section) && mockSession.sections[mockSession.section]) {
    const section=mockSession.sections[mockSession.section];
    if(Array.isArray(section.questions) && Number.isInteger(mockSession.index) && mockSession.index>=0 && mockSession.index<section.questions.length)
      add('mock','Письменный пробник',base+'/mock',`блок ${mockSession.section+1} · вопрос ${mockSession.index+1} из ${section.questions.length}`,'Сохранены ответы. Таймер продолжает идти при закрытой странице.');
  }
  const counters=read(storage,'n5.counters.v1'), phrases=read(storage,'n5-verb-phrases-v1'), relations=read(storage,'n5-word-relations-v1');
  if(Array.isArray(counters.session?.keys) && Number.isInteger(counters.session.position) && counters.session.position>=0 && counters.session.position<counters.session.keys.length) add('counters','Счётные суффиксы',base+'/counters',`задание ${counters.session.position+1} из ${counters.session.keys.length}`,'Сохранены текущий вопрос и ответы.');
  const audioId=Array.isArray(audio.queue) && Number.isInteger(audio.index) ? audio.queue[audio.index] : null;
  if(typeof audioId==='string') add('audio','Аудио',base+'/audio',`запись ${audio.index+1} из ${audio.queue.length} · ${clock(Number.isFinite(audio.positions?.[audioId]) ? Math.max(0,audio.positions[audioId]) : 0)}`,'Сохранены очередь и позиция записи; воспроизведение возобновляется по нажатию.');
  const due=dueSkills(preparation,now).length, mistakes=troubleSkills(preparation).length;
  const nextDue=Object.values(object(preparation.skills)).map(s=>s?.due).filter(n=>Number.isFinite(n)&&n>now).sort((a,b)=>a-b)[0] || null;
  const audioPositions=entries(audio.positions).filter(([,value])=>Number.isFinite(value)&&value>0).length;
  const mockRuns=preparation.exams.filter(run=>run && Number.isInteger(run.total) && run.total>0 && Number.isInteger(run.correct) && run.correct>=0 && run.correct<=run.total);
  const formStats=Object.values(object(training.stats));
  const correct=formStats.reduce((n,s)=>n+count(s?.correct),0), attempted=formStats.reduce((n,s)=>n+['correct','incorrect','answer','skip','hinted'].reduce((a,key)=>a+count(s?.[key]),0),0);
  const bookValues=Object.values(object(reading.books));
  const workbookCounts=entries(workbooks.books).map(([,book])=>({...statusCounts(book?.records),ungraded:statusCounts(book?.session?.answers).ungraded}));
  const examCounts=statusCounts(exams.records), cwAnswers=Object.values(object(courseWorkbook.answers));
  const counterStats=statusCounts(counters.session?.answers);
  const marked=store=>({known:Object.values(store).filter(v=>v==='known').length,learning:Object.values(store).filter(v=>v==='learning').length});
  const phraseStats=marked(phrases),relationStats=marked(relations);
  const sections=[
    {id:'course',title:'Курс и задания по темам',href:base+'/course',active:entries(preparation.questions).length>0,summary:`Заданий с результатом: ${entries(preparation.questions).length}. Тем с попытками: ${entries(preparation.topics).filter(([,s])=>count(s?.attempts)>0).length}.`},
    {id:'forms',title:'Слова и формы',href:base+'/practice',active:attempted>0,summary:`Ответов: ${attempted}. Верных: ${correct}. Ошибок для повторения: ${entries(training.mistakes).length}.`},
    {id:'reading',title:'Чтение',href:base+'/library',active:bookValues.length>0,summary:`Начато книг: ${bookValues.filter(s=>s?.updated || count(s?.page)>1 || s?.completed).length}. Прочитано: ${bookValues.filter(s=>s?.completed===true).length}.`},
    {id:'workbooks',title:'Учебные наборы',href:base+'/workbooks',active:workbookCounts.some(s=>s.reviewed>0||s.ungraded>0)||resumptions.some(s=>s.id.startsWith('workbook:')),summary:`Заданий с оценкой: ${workbookCounts.reduce((n,s)=>n+s.reviewed,0)}. Верных: ${workbookCounts.reduce((n,s)=>n+s.correct,0)}. Без оценки в сохранённом занятии: ${workbookCounts.reduce((n,s)=>n+s.ungraded,0)}.`},
    {id:'exam-sets',title:'Экзаменационные варианты',href:base+'/exams',active:examCounts.reviewed>0||examCounts.ungraded>0||entries(exams.sessions).length>0,summary:`Заданий с оценкой: ${examCounts.reviewed}. Верных: ${examCounts.correct}. Без оценки: ${examCounts.ungraded}.`},
    {id:'course-workbook',title:'Практика по тетради',href:base+'/course/workbook',active:cwAnswers.length>0,summary:`Автопроверка — верно: ${cwAnswers.filter(a=>a?.status==='correct').length}; нужно повторить: ${cwAnswers.filter(a=>a?.status==='review').length}. Самопроверка — получилось: ${cwAnswers.filter(a=>a?.status==='self-correct').length}; повторить: ${cwAnswers.filter(a=>a?.status==='self-review').length}.`},
    {id:'mock',title:'Письменный пробник',href:base+'/mock',active:mockRuns.length>0||resumptions.some(s=>s.id==='mock'),summary:mockRuns.length ? `Завершено пробников: ${mockRuns.length}. Последний: ${mockRuns.at(-1).correct} из ${mockRuns.at(-1).total}.` : 'Сохранён незавершённый письменный пробник.'},
    {id:'phrases',title:'Глаголы в сочетаниях',href:base+'/verb-phrases',active:phraseStats.known+phraseStats.learning>0,summary:`Знаю: ${phraseStats.known}. Изучаю: ${phraseStats.learning}.`},
    {id:'relations',title:'Связи слов',href:base+'/word-relations',active:relationStats.known+relationStats.learning>0,summary:`Знаю: ${relationStats.known}. Изучаю: ${relationStats.learning}.`},
    {id:'counters',title:'Счётные суффиксы',href:base+'/counters',active:counterStats.reviewed>0||resumptions.some(s=>s.id==='counters'),summary:`Ответов в сохранённом занятии: ${counterStats.reviewed}. Верных: ${counterStats.correct}.`},
    {id:'audio',title:'Аудио',href:base+'/audio',active:!!audioId||audioPositions>0,summary:audioId ? `Сохранена очередь: ${audio.queue.length} записей. Текущая: ${audio.index+1}.` : `Сохранено позиций записей: ${audioPositions}. Прослушивание не оценивается баллами.`},
  ];
  return {preparation,training,resumptions,sections,review:{due,mistakes,nextDue},hasActivity:sections.some(s=>s.active)||resumptions.length>0};
}
export function overviewCards(overview) {
  return `<div class="home-grid">${overview.sections.map(section=>`<article class="home-card"><h3>${esc(section.title)}</h3><p>${section.active?esc(section.summary):'Пока нет сохранённых результатов.'}</p><a href="${esc(section.href)}">Открыть раздел →</a></article>`).join('')}</div>`;
}
export function resumeLinks(overview,{exclude=[],limit=Infinity}={}) {
  return overview.resumptions.filter(item=>!exclude.includes(item.id)).slice(0,limit).map(item=>`<article class="home-card"><h3>${esc(item.title)}</h3><p>${esc(item.position)}</p><p class="home-help">${esc(item.reason)}</p><a href="${esc(item.href)}">Продолжить →</a></article>`).join('');
}
