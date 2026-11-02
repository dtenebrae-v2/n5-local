import { escapeHTML as esc } from './ui.js';
import { topicAssessment, dueSkills } from './preparation-progress.js';
export const percent = (correct,total) => total ? `${Math.round(correct/total*100)}% (${correct}/${total})` : '—';
export const elapsed = ms => `${Math.round(ms/60000)} мин`;
function table(headers,rows,label) {
  return `<div class="table-scroll" tabindex="0" role="region" aria-label="${esc(label)}"><table role="table"><thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map((cell,i)=>i===0?`<th scope="row">${esc(String(cell))}</th>`:`<td data-label="${esc(headers[i])}">${esc(String(cell))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
export function preparationStats(progress, bank) {
  const rows = bank.topics.map(topic => {
    const stats = progress.topics[topic.id];
    const recent = topicAssessment(progress,topic.id);
    const state = recent.state==='insufficient' ? `Мало данных (${recent.count} попыток, ${recent.examples} примеров)` : recent.state==='weak' ? 'Нужна практика' : 'Хороший результат';
    return [topic.label,state,percent(recent.correct,recent.count),stats?percent(stats.correct,stats.attempts):'—',
      stats?percent(stats.freshCorrect,stats.fresh):'—',stats?percent(stats.repeatCorrect,stats.repeat):'—',
      `${stats?.reference || 0} / ${stats?.revealed || 0}`,`${stats?.unknown || 0} / ${stats?.skipped || 0}`,
      stats?.timed ? `${Math.round(stats.elapsed/stats.timed/1000)} с` : '—'];
  });
  const skills = new Map((bank.skills || []).map(skill => [skill.id,skill]));
  const scheduled = Object.entries(progress.skills || {}).filter(([,s]) => s.due).sort((a,b)=>a[1].due-b[1].due);
  const scheduleRows = scheduled.map(([id,s]) => [skills.get(id)?.label || id,
    bank.topics.find(t=>t.id===s.topic)?.label || s.topic,s.needsPractice?'Есть нерешённая ошибка':'Закрепление',
    new Date(s.due).toLocaleString('ru-RU',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})]);
  return `<details class="prep-stats"><summary>Знания по темам</summary>
    <p class="practice-help">Оценка — по последним 20 самостоятельным попыткам: минимум 5 попыток и 3 разных примера. Повтор того же вопроса раньше чем через сутки не подтверждает знание заново. Непросмотренные вопросы и пропуски в эту оценку не входят.</p>
    ${table(['Тема','Оценка','Последние самостоятельные','За всё время','Новые задания','Повторные','Справка / ответ открыт','Не знаю / пропущено','Среднее время'],rows,'Статистика тем')}</details>
    <details class="prep-stats"><summary>Расписание слов и правил (${dueSkills(progress).length} пора повторить)</summary>${scheduleRows.length?table(['Слово или правило','Тема','Причина','Повторить'],scheduleRows,'Расписание повторений'):'<p>Пока нет изученного материала.</p>'}</details>
    <details class="prep-stats"><summary>История пробников (${progress.exams.length})</summary>${progress.exams.length?table(['Дата','Результат','Новые задания','Повторные','Ошибки','Открыто, без ответа','Не открыто','Время'],[...progress.exams].reverse().map(run=>[
      new Date(run.at).toLocaleString('ru-RU'),percent(run.correct,run.total),percent(run.freshCorrect,run.fresh),percent(run.repeatCorrect,run.repeat),run.incorrect??'—',run.skipped,run.unopened??'—',elapsed(run.elapsed)]),'История пробников'):'<p>Пока нет завершённых пробников.</p>'}</details>`;
}
