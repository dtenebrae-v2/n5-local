import { getJSON } from './api.js';
import { escapeHTML as esc } from './ui.js';
import { loadReading,readingState } from './library-progress.js';
import { mountBookReader } from './book-reader.js';

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
  root.innerHTML=`<h1>Книги Tadoku</h1><p>Tadoku · уровни 1 и 2</p>
    <label class="practice-label" for="library-search">Название книги</label><input id="library-search" class="library-search" type="search" autocomplete="off" placeholder="Поиск">
    <details class="catalogue-filters"><summary>Уровень и фильтры</summary><div class="library-filters" role="group" aria-label="Уровень">${[['','Все'],['1','Уровень 1'],['2','Уровень 2']].map(([value,label])=>`<button class="chip ${value===''?'selected':''}" data-level="${value}" aria-pressed="${value===''}">${label}</button>`).join('')}</div>
    <div class="library-filters" role="group" aria-label="Статус чтения">${[['','Все книги'],['reading','Читаю'],['completed','Прочитано']].map(([value,label])=>`<button class="chip ${value===''?'selected':''}" data-status="${value}" aria-pressed="${value===''}">${label}</button>`).join('')}<button class="chip" id="library-audio-only" aria-pressed="false">С локальным аудио</button></div>
    </details><p id="library-count" role="status"></p><div class="library-grid" id="library-results"></div>`;
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
      return `<article class="library-card book-catalog-card"><a class="book-cover" href="/jlpt/n5/library/${book.id}" aria-label="Открыть: ${esc(book.title)}"><img src="${esc(book.cover_url)}" alt="Первая страница: ${esc(book.title)}" loading="lazy" decoding="async" width="340" height="480" data-furigana="off"><span class="cover-fallback" hidden>Превью недоступно</span></a><div class="book-card-content"><p class="library-level">Уровень ${book.level}${book.assets.audio?.available?' · Аудио':''}</p><h2 lang="ja"><a href="/jlpt/n5/library/${book.id}">${esc(book.title)}</a></h2>
        <p>${state.completed?'Прочитано':state.updated?`Страница ${state.page}`:(state.totalPages || book.pdf_pages)?`${state.totalPages || book.pdf_pages} стр. PDF`:''}${available?'':' · Файл не загружен'}</p>
        <a class="primary" href="/jlpt/n5/library/${book.id}">${state.updated&&!state.completed?'Продолжить':'Открыть'}</a><details class="book-card-credits" data-furigana="off"><summary>О книге и источниках</summary>${credits(book)}</details></div></article>`;
    }).join(''):'<p>Книги не найдены.</p>';
  };
  root.addEventListener('error',event=>{ if (event.target.matches('.book-cover img')) { event.target.hidden=true; event.target.nextElementSibling.hidden=false; } },{capture:true,signal});
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
  return mountBookReader(root,book,progress,signal,book ? credits(book) : '');
}
