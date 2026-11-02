import { getJSON } from './api.js';
import { escapeHTML as esc } from './ui.js';
import { loadReading,saveReading,readingState } from './library-progress.js';

function credits(book) {
  const audio=book.assets.audio;
  return `<div class="library-credits"><p>${book.credits.map(esc).join(' · ')}</p>
    <p><a href="${esc(book.source)}" target="_blank" rel="noreferrer">NPO多言語多読 · Tadoku ↗</a> · PDF: <a href="${esc(book.license.url)}" target="_blank" rel="noreferrer">CC BY-NC-ND 4.0</a></p>
    ${audio?`<details><summary>Права на аудио</summary><p>Официальная загрузка для личного учебного прослушивания. Правообладатель: ${esc(audio.rights_holder)}. Чтец: ${esc(audio.narrator)}.</p><p><a href="${esc(audio.evidence)}" target="_blank" rel="noreferrer">Условия и источник аудио ↗</a></p></details>`:''}</div>`;
}
export async function mountLibrary(root,signal,bookId=null) {
  root.innerHTML='<p class="loading">Открываем библиотеку…</p>';
  const data=await getJSON('/api/library',signal);
  if(signal.aborted)return;
  const progress=loadReading();
  if(bookId)return openBook(root,data.books.find(book=>book.id===bookId),progress,signal);
  let level='',audio=false,status='';
  root.innerHTML=`<h1>Библиотека</h1><p>Tadoku · уровни 1 и 2</p>
    <label class="practice-label" for="library-search">Название книги</label><input id="library-search" class="library-search" type="search" autocomplete="off" placeholder="Поиск">
    <div class="library-filters" role="group" aria-label="Уровень">${[['','Все'],['1','Уровень 1'],['2','Уровень 2']].map(([value,label])=>`<button class="chip ${value===''?'selected':''}" data-level="${value}" aria-pressed="${value===''}">${label}</button>`).join('')}</div>
    <div class="library-filters" role="group" aria-label="Статус чтения">${[['','Все книги'],['reading','Читаю'],['completed','Прочитано']].map(([value,label])=>`<button class="chip ${value===''?'selected':''}" data-status="${value}" aria-pressed="${value===''}">${label}</button>`).join('')}<button class="chip" id="library-audio-only" aria-pressed="false">С локальным аудио</button></div>
    <p id="library-count" role="status"></p><div class="library-grid" id="library-results"></div>`;
  const input=root.querySelector('#library-search');
  const render=()=>{
    const query=input.value.trim().toLocaleLowerCase();
    const books=data.books.filter(book=>{
      const state=readingState(progress,book.id);
      return (!level||String(book.level)===level)&&(!audio||book.assets.audio?.available)
        &&(!status||(status==='completed'?state.completed:state.updated&&!state.completed))
        &&(!query||book.title.toLocaleLowerCase().includes(query));
    });
    root.querySelector('#library-count').textContent=`Книг: ${books.length}`;
    root.querySelector('#library-results').innerHTML=books.length?books.map(book=>{
      const state=readingState(progress,book.id),available=book.assets.pdf.available;
      return `<article class="library-card"><p class="library-level">Уровень ${book.level}${book.assets.audio?.available?' · Аудио':''}</p><h2 lang="ja"><a href="/jlpt/n5/library/${book.id}">${esc(book.title)}</a></h2>
        <p>${state.completed?'Прочитано':state.updated?`Страница ${state.page}`:book.pages?`${book.pages} стр.`:''}${available?'':' · Файл не загружен'}</p>
        <a class="primary" href="/jlpt/n5/library/${book.id}">${state.updated&&!state.completed?'Продолжить':'Открыть'}</a>${credits(book)}</article>`;
    }).join(''):'<p>Книги не найдены.</p>';
  };
  input.addEventListener('input',render,{signal});
  root.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button)return;
    for(const [attribute,assign] of [['data-level',value=>{level=value;}],['data-status',value=>{status=value;}]]) {
      if(button.hasAttribute(attribute)) {
        assign(button.getAttribute(attribute));
        root.querySelectorAll(`[${attribute}]`).forEach(b=>{const selected=b===button;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));});
      }
    }
    if(button.id==='library-audio-only'){audio=!audio;button.classList.toggle('selected',audio);button.setAttribute('aria-pressed',String(audio));}
    render();
  },{signal});
  render();
}
async function openBook(root,book,progress,signal) {
  if(!book){root.innerHTML='<h1>Книга не найдена</h1>';return;}
  document.title=`${book.title} · N5`;
  const state=readingState(progress,book.id),pdf=book.assets.pdf,audio=book.assets.audio;
  root.innerHTML=`<a class="library-back" href="/jlpt/n5/library">← Библиотека</a><h1 lang="ja">${esc(book.title)}</h1><p>Уровень ${book.level}</p>${credits(book)}
    <p id="reading-storage" role="status"></p>
    ${pdf.available?`<section class="book-viewer" aria-label="Чтение книги"><div class="book-controls">
    <button class="secondary" id="book-prev" aria-label="Предыдущая страница">←</button><label>Страница <input id="book-page" type="number" min="1" value="${state.page}" inputmode="numeric"></label><span id="book-total"></span><button class="secondary" id="book-next" aria-label="Следующая страница">→</button>
    <button class="secondary" id="book-zoom-out" aria-label="Уменьшить">−</button><button class="secondary" id="book-fit">Вписать</button><button class="secondary" id="book-zoom-in" aria-label="Увеличить">+</button><button class="secondary" id="book-fullscreen">На весь экран</button></div>
    <p id="book-loading" role="status">Загружаем PDF…</p><div id="book-stage" class="book-stage" aria-busy="true"><canvas aria-label="Страница книги"></canvas></div>
    <p id="book-error" role="alert"></p>
    ${audio?.available?`<div class="book-audio"><audio id="book-audio" controls preload="metadata" src="${esc(audio.local_url)}"></audio><div class="library-filters" role="group" aria-label="Скорость аудио">${[.75,1,1.25,1.5].map(rate=>`<button class="chip ${rate===state.rate?'selected':''}" data-rate="${rate}" aria-pressed="${rate===state.rate}">${rate}×</button>`).join('')}</div><p id="book-audio-error" role="status"></p></div>`:audio||book.audio_source?`<p><a href="${esc(audio?.evidence||book.audio_source)}" target="_blank" rel="noreferrer">Аудио на Tadoku ↗</a></p>`:''}
    <button class="secondary" id="book-completed" aria-pressed="${state.completed}">${state.completed?'Прочитано ✓':'Отметить прочитанным'}</button></section>
    <div class="library-filters"><a class="secondary" href="${esc(pdf.local_url)}?download=1">Скачать оригинальный PDF</a>${book.assets.print?.available?`<a class="secondary" href="${esc(book.assets.print.local_url)}?download=1">PDF для печати</a>`:''}</div>`:'<p>Локальная копия пока не загружена.</p>'}`;
  if(!pdf.available)return;
  const viewer=root.querySelector('.book-viewer'),stage=root.querySelector('#book-stage');
  const player=root.querySelector('#book-audio'),pageInput=root.querySelector('#book-page');
  let loadingTask,pdfDocument,renderTask,generation=0,resize,lastWidth=0,lastAudioSave=0,audioReady=false;
  function save() {
    if(player && audioReady && Number.isFinite(player.currentTime))state.audioTime=player.currentTime;
    state.updated=Date.now();progress.books[book.id]={...state};
    const success=saveReading(progress);
    root.querySelector('#reading-storage').textContent=success?'':'Не удалось сохранить позицию чтения в браузере.';
  }
  function updateControls() {
    pageInput.value=state.page;
    root.querySelector('#book-prev').disabled=!pdfDocument||state.page<=1;
    root.querySelector('#book-next').disabled=!pdfDocument||state.page>=pdfDocument.numPages;
    root.querySelector('#book-zoom-out').disabled=state.zoom<=.5;
    root.querySelector('#book-zoom-in').disabled=state.zoom>=2;
  }
  async function paint() {
    if(!pdfDocument||signal.aborted)return;
    const current=++generation;
    const prior=renderTask;if(prior){prior.cancel();await prior.promise.catch(()=>{});}
    stage.setAttribute('aria-busy','true');
    try {
      const page=await pdfDocument.getPage(state.page);
      if(signal.aborted||current!==generation)return;
      const base=page.getViewport({scale:1});
      const scale=(stage.clientWidth/base.width)*state.zoom;
      const viewport=page.getViewport({scale});
      const density=Math.min(window.devicePixelRatio||1,2);
      const canvas=document.createElement('canvas');
      canvas.width=Math.ceil(viewport.width*density);canvas.height=Math.ceil(viewport.height*density);
      canvas.style.width=`${viewport.width}px`;canvas.style.height=`${viewport.height}px`;
      canvas.setAttribute('aria-label',`Страница ${state.page} из ${pdfDocument.numPages}`);
      renderTask=page.render({canvasContext:canvas.getContext('2d'),viewport,transform:density===1?null:[density,0,0,density,0,0]});
      await renderTask.promise;
      if(signal.aborted||current!==generation)return;
      stage.replaceChildren(canvas);stage.setAttribute('aria-busy','false');
      root.querySelector('#book-loading').textContent='';
      root.querySelector('#book-error').textContent='';
    }catch(error){
      if(!signal.aborted&&error.name!=='RenderingCancelledException')root.querySelector('#book-error').innerHTML=`Не удалось показать страницу. <a href="${esc(pdf.local_url)}" target="_blank">Открыть оригинальный PDF ↗</a>`;
    }
  }
  function move(value) {
    if(!pdfDocument)return;
    const page=Number(value);
    if(!Number.isInteger(page)){pageInput.value=state.page;return;}
    state.page=Math.max(1,Math.min(pdfDocument.numPages,page));updateControls();save();paint();
  }
  pageInput.addEventListener('change',()=>move(pageInput.value),{signal});
  root.querySelector('#book-prev').addEventListener('click',()=>move(state.page-1),{signal});
  root.querySelector('#book-next').addEventListener('click',()=>move(state.page+1),{signal});
  for(const [id,value] of [['book-zoom-out',-.25],['book-zoom-in',.25],['book-fit',0]])root.querySelector('#'+id).addEventListener('click',()=>{
    state.zoom=value?Math.min(2,Math.max(.5,state.zoom+value)):1;updateControls();save();paint();
  },{signal});
  const fullscreen=root.querySelector('#book-fullscreen');
  fullscreen.hidden=!viewer.requestFullscreen;
  fullscreen.addEventListener('click',async()=>{
    try{if(document.fullscreenElement)await document.exitFullscreen();else await viewer.requestFullscreen();}
    catch{root.querySelector('#book-error').textContent='Полноэкранный режим недоступен.';}
  },{signal});
  root.querySelector('#book-completed').addEventListener('click',event=>{
    state.completed=!state.completed;event.target.textContent=state.completed?'Прочитано ✓':'Отметить прочитанным';event.target.setAttribute('aria-pressed',String(state.completed));save();
  },{signal});
  if(player) {
    player.playbackRate=state.rate;
    player.addEventListener('loadedmetadata',()=>{if(state.audioTime)player.currentTime=Math.min(state.audioTime,Number.isFinite(player.duration)?Math.max(0,player.duration-.1):state.audioTime);audioReady=true;},{signal});
    player.addEventListener('timeupdate',()=>{if(Date.now()-lastAudioSave>1000){save();lastAudioSave=Date.now();}},{signal});
    player.addEventListener('pause',save,{signal});
    player.addEventListener('seeked',save,{signal});
    player.addEventListener('error',()=>{root.querySelector('#book-audio-error').textContent='Не удалось открыть аудио. Исходная запись доступна по ссылке в сведениях о правах.';},{signal});
    root.querySelectorAll('[data-rate]').forEach(button=>button.addEventListener('click',()=>{
      state.rate=Number(button.dataset.rate);player.playbackRate=state.rate;save();root.querySelectorAll('[data-rate]').forEach(b=>{b.classList.toggle('selected',b===button);b.setAttribute('aria-pressed',String(b===button));});
    },{signal}));
  }
  document.addEventListener('keydown',event=>{
    if(event.altKey||event.ctrlKey||event.metaKey||event.shiftKey||event.isComposing||event.target.closest('input,audio,textarea,[contenteditable]')||document.querySelector('dialog[open]'))return;
    if(event.key==='ArrowRight'||event.key==='ArrowLeft'){event.preventDefault();move(state.page+(event.key==='ArrowRight'?1:-1));}
  },{signal});
  window.addEventListener('pagehide',save,{signal});
  signal.addEventListener('abort',()=>{
    generation++;save();resize?.disconnect();renderTask?.cancel();
    if(player){player.pause();player.removeAttribute('src');player.load();}
    if(loadingTask)void loadingTask.destroy().catch(()=>{});
  },{once:true});
  updateControls();
  try {
    const pdfjs=await import('../vendor/pdfjs-5.6.205/pdf.min.mjs');
    if(signal.aborted)return;
    pdfjs.GlobalWorkerOptions.workerSrc='/vendor/pdfjs-5.6.205/pdf.worker.min.mjs';
    loadingTask=pdfjs.getDocument({url:pdf.local_url,cMapUrl:'/vendor/pdfjs-5.6.205/cmaps/',cMapPacked:true,
      standardFontDataUrl:'/vendor/pdfjs-5.6.205/standard_fonts/',isEvalSupported:false,disableFontFace:true,useWasm:false,
      disableAutoFetch:true,disableStream:true});
    pdfDocument=await loadingTask.promise;
    if(signal.aborted)return;
    state.page=Math.min(state.page,pdfDocument.numPages);pageInput.max=pdfDocument.numPages;
    root.querySelector('#book-total').textContent=`из ${pdfDocument.numPages}`;
    updateControls();save();await paint();
    resize=new ResizeObserver(()=>{if(Math.abs(stage.clientWidth-lastWidth)>1){lastWidth=stage.clientWidth;paint();}});
    lastWidth=stage.clientWidth;resize.observe(stage);
  }catch(error){
    if(!signal.aborted){root.querySelector('#book-loading').textContent='';root.querySelector('#book-error').innerHTML=`Не удалось открыть PDF. <a href="${esc(pdf.local_url)}" target="_blank">Открыть оригинал ↗</a>`;}
  }
}
