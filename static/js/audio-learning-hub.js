import { getJSON } from './api.js';
import { escapeHTML as esc } from './ui.js';

const SOURCES = new Set(['all','exams','workbooks','books']);
export function audioHubContext(search='') {
  const params=new URLSearchParams(search);
  return {mode:params.get('mode')==='practice'?'practice':'listen',source:SOURCES.has(params.get('source'))?params.get('source'):'all'};
}
export function audioHubURL(mode,source='all') {
  const params=new URLSearchParams({mode:mode==='practice'?'practice':'listen',source:SOURCES.has(source)?source:'all'});
  return '/jlpt/n5/audio?'+params;
}
export function audioHubModes(mode,source) {
  return `<nav class="library-filters audio-learning-modes" aria-label="Режим аудио">${[['listen','Слушать записи'],['practice','Тренировать аудирование']].map(([id,title])=>`<a class="chip${mode===id?' selected':''}" href="${esc(audioHubURL(id,source))}" ${mode===id?'aria-current="page"':''}>${title}</a>`).join('')}</nav>`;
}
// Derive exercise destinations from the same banks the existing players consume.
// A recording alone is not evidence that matching, gradable questions exist.
export function buildAudioLearningSources(tracks,{exams=[],workbooks=[]}={}) {
  const known=new Map(tracks.map(track=>[track.id,track]));
  const sources=[];
  for(const exam of exams) for(const section of exam.sections || []) {
    if(section.id!=='listening'||!section.audio)continue;
    const track=known.get(`exam:${exam.id}:${section.audio}`);
    const items=(section.groups||[]).flatMap(group=>group.items||[]).filter(item=>Number.isInteger(item.correct) && item.correct>=0 && item.clip);
    if(!track||!items.length||exam.assets?.[section.audio]?.matched===false)continue;
    const params=new URLSearchParams({section:'listening',mode:'practice',audio:section.audio,from:'audio'});
    sources.push({id:track.id,group:'exams',title:exam.title,subtitle:'Экзаменационные задания',count:items.length,graded:items.length,href:`/jlpt/n5/exams/${encodeURIComponent(exam.id)}?${params}`});
  }
  for(const book of workbooks) for(const unit of book.units||[]) {
    const items=(book.items||[]).filter(item=>item.unit===unit.id && item.kind==='listening' && (item.audio||unit.audio));
    for(const key of new Set(items.map(item=>item.audio||unit.audio))) {
      const track=known.get(`workbook:${book.id}:${key}`);if(!track)continue;
      const questions=items.filter(item=>(item.audio||unit.audio)===key);
      const params=new URLSearchParams({section:'listening',unit:unit.id,audio:key,from:'audio'});
      sources.push({id:`${track.id}:${unit.id}`,group:'workbooks',title:book.title,subtitle:unit.title||`Неделя ${unit.week} · день ${unit.day}`,count:questions.length,graded:questions.filter(q=>Number.isInteger(q.correct)&&q.correct>=0).length,href:`/jlpt/n5/workbooks/${encodeURIComponent(book.id)}?${params}`});
    }
  }
  return sources;
}
export async function loadAudioLearningSources(tracks,signal) {
  const [examCatalog,workbookCatalog]=await Promise.all([getJSON('/api/exams',signal),getJSON('/api/workbooks',signal)]);
  const requests=[...examCatalog.sets.filter(set=>set.available).map(set=>({kind:'exams',url:'/api/exam?id='+encodeURIComponent(set.id)})),...workbookCatalog.books.filter(book=>book.available).map(book=>({kind:'workbooks',url:'/api/workbook?id='+encodeURIComponent(book.id)}))];
  const results=await Promise.allSettled(requests.map(request=>getJSON(request.url,signal)));
  if(signal.aborted)return {sources:[],failed:false};
  const documents={exams:[],workbooks:[]};let failed=false;
  results.forEach((result,index)=>{if(result.status==='fulfilled')documents[requests[index].kind].push(result.value);else failed=true;});
  return {sources:buildAudioLearningSources(tracks,documents),failed};
}
export function audioLearningCards(sources,source='all',tracks=[]) {
  if(source==='books') {
    const books=tracks.filter(track=>track.group==='books');
    return `<p>У книг нет тестовых заданий. Можно читать и слушать запись вместе, без проверки ответов.</p><div class="library-grid">${books.map(track=>`<article class="library-card"><h3>${esc(track.title)}</h3><a class="secondary" href="/jlpt/n5/library/${encodeURIComponent(track.id.slice(5))}?from=audio">Читать и слушать</a></article>`).join('')}</div>`;
  }
  const visible=sources.filter(item=>source==='all'||item.group===source);
  return `<p>Выберите учебник или экзаменационный вариант.</p><div class="library-grid">${visible.map(item=>`<article class="library-card"><h3>${esc(item.title)}</h3><p>${esc(item.subtitle)}</p><p>${item.count} заданий · ${item.graded===item.count?'с проверкой ответов':item.graded?'с проверкой: '+item.graded:'без автопроверки'}</p><a class="secondary" href="${esc(item.href)}">Открыть аудиозадания</a></article>`).join('')||'<p>Для этого источника пока нет сопоставленных аудиозаданий. Полные записи доступны в режиме «Слушать записи».</p>'}</div>`;
}
