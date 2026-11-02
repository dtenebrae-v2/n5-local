import { escapeHTML as esc } from './ui.js';
export const percent = (correct,total) => total ? `${Math.round(correct/total*100)}% (${correct}/${total})` : '—';
export const elapsed = ms => `${Math.round(ms/60000)} мин`;
function table(headers,rows,label) {
  return `<div class="table-scroll" tabindex="0" role="region" aria-label="${esc(label)}"><table role="table"><thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map((cell,i)=>i===0?`<th scope="row">${esc(String(cell))}</th>`:`<td data-label="${esc(headers[i])}">${esc(String(cell))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
export function preparationStats(progress, bank) {
  const rows=bank.topics.map(t=>{
    const s=progress.topics[t.id];
    return [t.label,s?percent(s.correct,s.attempts):'Ещё нет ответов',s?percent(s.freshCorrect,s.fresh):'—',s?percent(s.repeatCorrect,s.repeat):'—',`${s?.hinted||0} / ${s?.skipped||0}`,s?.timed?`${Math.round(s.elapsed/s.timed/1000)} с`:'—',s?.due?new Date(s.due).toLocaleString('ru-RU',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'—'];
  });
  return `<details class="prep-stats"><summary>Знания по темам</summary>${table(['Тема','Без подсказки','Новые задания','Повторные','С подсказкой / пропуски','Среднее время','Повторить'],rows,'Статистика тем')}</details>
  <details class="prep-stats"><summary>История пробников (${progress.exams.length})</summary>${progress.exams.length?table(['Дата','Результат','Новые задания','Повторные','Пропуски','Время'],[...progress.exams].reverse().map(r=>[new Date(r.at).toLocaleString('ru-RU'),percent(r.correct,r.total),percent(r.freshCorrect,r.fresh),percent(r.repeatCorrect,r.repeat),r.skipped,elapsed(r.elapsed)]),'История пробников'):'<p>Пока нет завершённых пробников.</p>'}</details>`;
}
