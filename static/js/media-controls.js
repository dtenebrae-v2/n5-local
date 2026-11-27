import { audioIcon } from './audio-controls.js';

// One visual contract for a recording, an exercise clip and a book.
// Playback ownership, clip bounds and persistence remain with the caller.
export function mediaControls({play='',back='',forward='',rate='',seek='',time='',value=1,disabled=false,restart='',queue='',continuous=false}={}) {
 const unavailable=disabled?'disabled':'';
 const button=(attrs,label,body,primary=false)=>`<button type="button" class="${primary?'primary':'secondary'} audio-icon-button" ${attrs} aria-label="${label}" title="${label}" ${unavailable}>${body}</button>`;
 return `<div class="media-controls" role="group" aria-label="Управление аудио">
 <div class="media-main">${button(`${play} data-media-toggle data-audio-icon="play"`,'Слушать',audioIcon('play'),true)}
 ${!continuous?`${button(back,'Назад на 15 секунд','−15 с')}${button(forward,'Вперёд на 15 секунд','+15 с')}<label class="media-rate"><span class="sr-only">Скорость аудио</span><select ${rate} aria-label="Скорость аудио">${[.75,1,1.25,1.5].map(n=>`<option value="${n}" ${n===value?'selected':''}>${n}×</option>`).join('')}</select></label>`:''}
 </div>
 ${!continuous?`<div class="media-timeline"><input type="range" ${seek} min="0" max="0" step=".1" value="0" aria-label="Позиция аудио" ${unavailable}><span ${time} class="media-time">0:00 / 0:00</span></div>`:''}
 ${restart?`<div class="media-aux">${button(restart,'Повторить с начала','↺<span>Сначала</span>')}</div>`:''}
 ${queue?`<div class="media-queue" role="group" aria-label="Управление очередью">${queue}</div>`:''}</div>`;
}
