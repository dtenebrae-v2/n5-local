import { prepareStudyPage, studySession } from './learning-ui.js';
import { rubyText } from './furigana-core.js';
import { getJSON } from './api.js';
import { escapeHTML as esc, heading, breadcrumbs } from './ui.js';
import { answerFields, bindAnswer } from './practice-answer.js';
import { RELATION_PROGRESS_KEY, RELATION_LABELS, readRelationProgress, selectRelations, relationSession, relationExercise } from './word-relation-exercise.js';

const statuses = { new: 'Новое', learning: 'Учу', known: 'Знаю' };
const symbol = kind => kind === 'antonym' ? '↔' : '≈';
const sideHTML = side => `<div class="relation-side"><h3 lang="ja">${rubyText(side.written,side.reading)}</h3><p class="kana" lang="ja">${esc(side.reading)}</p><p>${esc(side.meaning)}</p></div>`;

export async function mountWordRelations(root, signal) {
  root.innerHTML = '<p class="loading">Открываем связи слов…</p>';
  const data = await getJSON('/api/word-relations', signal);
  if (signal.aborted) return;
  const relations = data.relations;
  let raw, last;
  let storageOK = true;
  try { raw = localStorage.getItem(RELATION_PROGRESS_KEY); last = localStorage.getItem('n5-word-relation-position'); }
  catch { storageOK = false; }
  const progress = readRelationProgress(raw, relations);
  const filters = { kind: '', status: '', query: '' };
  let current = relations.find(r => r.id === last) || relations[0];
  let session = null, position = 0, results = [], binding;
  root.innerHTML = breadcrumbs('/jlpt/n5', [['Синонимы и антонимы']])
    + heading('СВЯЗИ СЛОВ · ИЗУЧЕНИЕ И ПОВТОРЕНИЕ', 'Синонимы и антонимы', 'Учите слова через противоположные и близкие значения, а отрицательные формы — через перефразирование.')
    + `<p>В материале ${relations.length} связок. Знак ≈ означает близкое значение в указанном контексте. Например, «тёмный» и «не светлый» могут описывать похожую ситуацию, но не всегда означают одно и то же.</p>
    ${data.unavailable ? `<p>Недоступно связок из-за изменений словаря: ${data.unavailable}.</p>` : ''}
    <p id="relation-storage" role="status" ${storageOK ? 'hidden' : ''}>Сохранение в браузере недоступно. Отметки останутся только до ухода со страницы.</p>
    <section class="phrase-filters" aria-label="Выбор связок">
      <label>Поиск <input type="search" id="relation-search" placeholder="Слово, чтение или перевод"></label>
      <label>Тип связи <select id="relation-kind"><option value="">Все связи</option>${Object.entries(RELATION_LABELS).map(([k,v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
      <label>Изучение <select id="relation-status"><option value="">Все карточки</option>${Object.entries(statuses).map(([k,v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
    </section><p id="relation-count" role="status" aria-live="polite"></p>
    <div class="phrase-layout"><section id="relation-study" aria-label="Карточка изучения"></section>
      <details class="phrase-directory"><summary>Список связок</summary><div id="relation-list"></div></details></div>
    <section class="phrase-training" aria-labelledby="relation-training-title"><h2 id="relation-training-title">Закрепление изученного</h2>
      <p>До 10 заданий по выбранным фильтрам. Антонимы и близкие слова спрашиваются в обоих направлениях; отрицание — по указанному слову. Ошибки возвращаются в «Учу».</p>
      <label><input id="relation-studied" type="checkbox" ${Object.keys(progress).length?'checked':''}> Только карточки с отметкой «Учу» или «Знаю»</label>
      <button id="relation-start" class="primary" type="button">Начать тренировку</button><p id="relation-training-help" role="status"></p><div id="relation-task"></div>
    </section><details class="phrase-sources"><summary>О материале и источники</summary>
      <p>Пары подобраны для отдельных значений словаря. Близкие слова могут отличаться стилем речи и сочетаемостью. Отрицание антонима обычно слабее прямого утверждения: «не большой» не обязательно значит «маленький».</p>
      ${data.sources.map(s => `<p><a href="${esc(s.url)}" target="_blank" rel="noreferrer">${esc(s.title)} ↗</a></p>`).join('')}</details>`;
  prepareStudyPage(root, signal);
  const el = id => root.querySelector(`#${id}`);
  const pool = () => selectRelations(relations, progress, filters);
  const trainingPool = () => pool().filter(r => !el('relation-studied').checked || progress[r.id]);
  function save() {
    try { localStorage.setItem(RELATION_PROGRESS_KEY, JSON.stringify(progress)); }
    catch { el('relation-storage').hidden = false; }
  }
  function updateTraining() {
    const count = trainingPool().length;
    el('relation-start').disabled = !count || session !== null;
    el('relation-training-help').textContent = count ? `Доступно связок: ${count}.` : 'Нет карточек для тренировки. Изучите и отметьте карточки или измените фильтры.';
  }
  function renderStudy() {
    const area = el('relation-study');
    if (!current) { area.innerHTML = '<p>Карточек по этим фильтрам нет. Измените поиск, тип связи или статус.</p>'; return; }
    const r = current;
    try { localStorage.setItem('n5-word-relation-position', r.id); } catch { el('relation-storage').hidden = false; }
    area.innerHTML = `<article class="game-card phrase-card"><p class="eyebrow">${RELATION_LABELS[r.kind]} · ${statuses[progress[r.id] || 'new']}</p>
      <h2 class="relation-context">${esc(r.context)}</h2>
      <div class="relation-pair">${sideHTML(r.left)}<span class="relation-symbol" aria-label="${r.kind === 'antonym' ? 'Противоположные значения' : 'Близкие значения'}">${symbol(r.kind)}</span>${sideHTML(r.right)}</div>
      <p class="phrase-note">${esc(r.note)}</p>
      <div class="practice-actions"><button type="button" class="secondary" id="relation-learning">Учу · повторять</button><button type="button" class="primary" id="relation-known">Знаю · дальше</button><button type="button" class="secondary" id="relation-reset" ${progress[r.id]?'':'hidden'}>Снять отметку</button></div>
      <div class="practice-actions"><button type="button" class="secondary" id="relation-prev">← Назад</button><button type="button" class="secondary" id="relation-next">Далее →</button></div>
      <div class="relation-dictionary">${[r.left,r.right].map(side => `<a class="lesson-link" href="/jlpt/n5/vocabulary/complete?q=${encodeURIComponent(side.word)}">${esc(side.word)} в словаре →</a>`).join('')}</div></article>`;
    function mark(status) {
      const before = pool(), index = before.indexOf(r);
      if (status) progress[r.id] = status; else delete progress[r.id];
      save();
      const after = pool();
      current = before.slice(index + 1).find(item => after.includes(item)) || after[0];
      render();
    }
    el('relation-learning').onclick = () => mark('learning');
    el('relation-known').onclick = () => mark('known');
    el('relation-reset').onclick = () => mark(null);
    const move = step => { const list = pool(); current = list[(list.indexOf(current) + step + list.length) % list.length]; renderStudy(); };
    el('relation-prev').onclick = () => move(-1);
    el('relation-next').onclick = () => move(1);
  }
  function render() {
    const list = pool();
    if (!list.includes(current)) current = list[0];
    el('relation-count').textContent = `Выбрано: ${list.length}. Учу: ${relations.filter(r => progress[r.id] === 'learning').length}. Знаю: ${relations.filter(r => progress[r.id] === 'known').length}.`;
    el('relation-list').innerHTML = list.map(r => `<button type="button" class="secondary phrase-list-item" data-relation="${esc(r.id)}"><span lang="ja">${rubyText(r.left.written,r.left.reading)} ${symbol(r.kind)} ${rubyText(r.right.written,r.right.reading)}</span><span>${esc(r.context)}</span><small>${RELATION_LABELS[r.kind]} · ${statuses[progress[r.id] || 'new']}</small></button>`).join('');
    renderStudy(); updateTraining();
  }
  el('relation-list').addEventListener('click', e => {
    const button = e.target.closest('[data-relation]');
    if (!button) return;
    current = relations.find(r => r.id === button.dataset.relation); renderStudy();
    el('relation-study').scrollIntoView({ block: 'nearest' });
  }, { signal });
  for (const [id, field] of [['relation-search','query'],['relation-kind','kind'],['relation-status','status']]) {
    el(id).addEventListener(id === 'relation-search' ? 'input' : 'change', e => { filters[field] = e.target.value; render(); }, { signal });
  }
  el('relation-studied').addEventListener('change', updateTraining, { signal });
  function finish() {
    studySession(root,false); binding?.destroy(); binding = null; session = null; updateTraining(); }
  function task() {
    binding?.destroy(); binding = null;
    const area = el('relation-task');
    if (position === session.length) {
      area.innerHTML = `<h3 tabindex="-1">Занятие завершено: ${results.filter(r => r === 'correct').length} из ${session.length} с первой попытки</h3>
        <ul>${session.map((item,i) => { const ex = relationExercise(item.relation,item.reverse); return `<li><span lang="ja">${rubyText(ex.source.written,ex.source.reading)} ${symbol(item.relation.kind)} ${rubyText(ex.target.written,ex.target.reading)}</span> · ${results[i] === 'correct' ? 'Верно' : results[i] === 'answer' ? 'С подсказкой · повторить' : 'Повторить'}</li>`; }).join('')}</ul>`;
      finish(); render(); area.querySelector('h3').focus(); return;
    }
    const item = session[position], r = item.relation, ex = relationExercise(r, item.reverse);
    area.innerHTML = `<section class="game-card phrase-card"><p>Задание ${position + 1} из ${session.length} · ${RELATION_LABELS[r.kind]}</p><h3>${esc(r.context)}</h3>
      <p class="phrase-japanese" lang="ja">${rubyText(ex.source.written,ex.source.reading)}</p><p class="kana" lang="ja">${esc(ex.source.reading)}</p><p>${esc(ex.source.meaning)}</p><p>${esc(ex.instruction)}</p>
      <form id="practice-form">${answerFields()}</form><button id="relation-task-next" class="secondary" type="button" disabled>Дальше →</button><button id="relation-task-stop" class="secondary" type="button">Закончить тренировку</button></section>`;
    area.querySelector('.practice-label').textContent = r.kind === 'paraphrase' ? 'Отрицательная форма' : 'Слово из пары';
    area.querySelector('#practice-input-help').textContent = 'Можно писать каной или кандзи. Ромадзи превращается в хирагану. Пишите слово без です.';
    area.querySelector('#practice-rules').remove();
    binding = bindAnswer(area, () => ex, status => {
      if (status === 'incomplete') return;
      if (!results[position]) {
        results[position] = status;
        if (status !== 'correct') { progress[r.id] = 'learning'; save(); render(); }
      }
      el('relation-task-next').disabled = false;
    });
    el('relation-task-next').onclick = () => { position++; task(); };
    el('relation-task-stop').onclick = () => { finish(); area.innerHTML = '<p role="status">Тренировка закончена. Отметки карточек сохранены.</p>'; };
    binding.focus();
  }
  el('relation-start').addEventListener('click', () => {
    session = relationSession(trainingPool());
    if (!session.length) { session = null; updateTraining(); return; }
    studySession(root,true);
    position = 0; results = []; updateTraining(); task();
  }, { signal });
  signal.addEventListener('abort', () => binding?.destroy(), { once: true });
  render();
}
