import {escapeHTML as esc} from './ui.js';

export function questionFragments(question,assets) {
  if (!question.media) return '<p>Разметка этого набора ещё не подключена. Исходник доступен кнопкой «Исходные страницы».</p>';
  if (!question.media.length) return '<p class="exam-spoken-task">Прослушайте вопрос и три варианта ответа. Выберите один ответ для этого вопроса.</p>';
  return ['context','question'].map(role=>{
    const parts=question.media.filter(part=>part.role===role);
    if(!parts.length)return '';
    return `<section class="exam-fragment-group" aria-label="${role==='context'?'Текст к заданию':'Текущее задание'}">${role==='context'?'<h3>Текст к заданию</h3>':''}${parts.map(part=>{
      const asset=assets[part.asset];
      return asset?.available ? `<button type="button" class="exam-fragment" data-exam-image="${esc(part.asset)}" aria-label="Увеличить ${role==='context'?'текст':'задание'} № ${question.number}"><img src="${esc(asset.url)}" width="${asset.width}" height="${asset.height}" alt="${role==='context'?'Текст к заданию':'Задание'} № ${question.number}" loading="lazy"><span class="exam-fragment-caption">Увеличить</span></button>`:'<p role="alert">Фрагмент недоступен.</p>';
    }).join('')}</section>`;
  }).join('');
}

export function imageZoomDialog(asset,title,signal,close) {
  const dialog=document.createElement('dialog');dialog.className='practice-dialog exam-image-dialog';
  dialog.setAttribute('aria-labelledby','exam-image-title');
  dialog.innerHTML=`<div class="practice-header"><h2 id="exam-image-title">${esc(title)}</h2><button class="practice-close" aria-label="Закрыть изображение">×</button></div><div class="practice-actions"><button class="secondary" data-image-zoom="1">По ширине</button><button class="secondary" data-image-zoom="2">Крупнее</button><button class="secondary" data-image-zoom="3">Ещё крупнее</button></div><div class="exam-image-viewport" tabindex="0" role="region" aria-label="Увеличенный фрагмент: прокрутка и масштабирование двумя пальцами"><img src="${esc(asset.url)}" alt="${esc(title)}"></div>`;
  const viewport=dialog.querySelector('.exam-image-viewport'), image=viewport.querySelector('img');
  let pinch=null,scale=1;
  function zoom(value,point=null) {
    const rect=viewport.getBoundingClientRect();const x=point ? point[0]-rect.left : viewport.clientWidth/2,y=point ? point[1]-rect.top : viewport.clientHeight/2;
    const oldWidth=image.clientWidth,oldHeight=image.clientHeight;
    const left=(viewport.scrollLeft+x)/Math.max(1,oldWidth),top=(viewport.scrollTop+y)/Math.max(1,oldHeight);
    scale=Math.max(1,Math.min(4,value));image.style.width=`${scale*100}%`;
    viewport.scrollLeft=left*image.clientWidth-x;viewport.scrollTop=top*image.clientHeight-y;
  }
  dialog.addEventListener('click',event=>{const button=event.target.closest('button');if(button?.dataset.imageZoom)zoom(Number(button.dataset.imageZoom));},{signal});
  viewport.addEventListener('touchstart',event=>{if(event.touches.length===2){event.preventDefault();pinch={distance:Math.hypot(event.touches[0].clientX-event.touches[1].clientX,event.touches[0].clientY-event.touches[1].clientY),scale};}},{signal,passive:false});
  viewport.addEventListener('touchmove',event=>{if(pinch&&event.touches.length===2){event.preventDefault();const [a,b]=event.touches;zoom(pinch.scale*Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY)/pinch.distance,[(a.clientX+b.clientX)/2,(a.clientY+b.clientY)/2]);}},{signal,passive:false});
  for(const name of ['touchend','touchcancel'])viewport.addEventListener(name,()=>{pinch=null;},{signal});
  dialog.querySelector('.practice-close').onclick=()=>dialog.close();
  dialog.addEventListener('close',()=>{dialog.remove();close();},{once:true});
  document.body.append(dialog);dialog.showModal();return dialog;
}
