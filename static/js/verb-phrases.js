import { rubyText } from './furigana-core.js';
import { getJSON } from './api.js';
import { escapeHTML as esc, heading, breadcrumbs } from './ui.js';
import { answerFields, bindAnswer } from './practice-answer.js';
import { PHRASE_PROGRESS_KEY, phraseText, phraseReading, phraseExercise, readPhraseProgress, selectPhrases, phraseSession } from './verb-phrase-exercise.js';

const labels = { new: 'Новое', learning: 'Учу', known: 'Знаю' };
const particleHints = { 'を': 'を — объект действия; также путь движения или место, которое покидают.',
  'に': 'に — направление, место нахождения, адресат или другая связь с глаголом. Запомните её в этом сочетании.',
  'で': 'で — место действия, средство или причина.', 'が': 'が — обозначает, о ком или о чём говорится.',
  'と': 'と — вместе с кем совершается действие.', 'へ': 'へ — направление движения; читается «э».' };

export async function mountVerbPhrases(root, signal) {
  root.innerHTML = '<p class="loading">Открываем сочетания…</p>';
  const data = await getJSON('/api/verb-phrases', signal);
  if (signal.aborted) return;
  const phrases = data.phrases;
  let raw;
  let lastWord;
  let storageOK = true;
  try { raw = localStorage.getItem(PHRASE_PROGRESS_KEY); lastWord = localStorage.getItem('n5-verb-phrase-position'); } catch { storageOK = false; }
  const progress = readPhraseProgress(raw, phrases);
  const filters = { topic: '', status: '', query: '' };
  let current = phrases.find(p => String(p.word_id) === (new URLSearchParams(location.search).get('word') || lastWord)) || phrases[0];
  const requestedWord = new URLSearchParams(location.search).get('word');
  let binding;
  let session = null;
  let position = 0;
  let results = [];
  let mode = 'verb';
  const topics = [...new Set(phrases.map(p => p.topic))];
  root.innerHTML = breadcrumbs('/jlpt/n5', [['Глаголы в сочетаниях']])
    + heading('ИЗУЧЕНИЕ И ПОВТОРЕНИЕ', 'Глаголы в сочетаниях', 'Учите глагол вместе со словами и частицами. Сначала изучите карточки, затем закрепите их в тренировке.')
    + `<p>Покрыто <strong>${phrases.length} из ${data.total_verbs}</strong> глагольных записей словаря. Разные значения одного глагола изучаются отдельно.</p>
    ${data.uncovered.length ? `<details><summary>Без готовых сочетаний: ${data.uncovered.length}</summary><p>${data.uncovered.map(w => `${esc(w.kanji)}（${esc(w.reading)}）`).join('、')}</p><p>Для этих добавленных или изменённых слов сочетания ещё не подготовлены.</p></details>` : ''}
    ${requestedWord && !phrases.some(p => String(p.word_id) === requestedWord) ? '<p role="status">Для выбранного слова пока нет готового сочетания. Ниже доступны остальные глаголы.</p>' : ''}
    <p id="phrase-storage" role="status" ${storageOK ? 'hidden' : ''}>Сохранение в браузере недоступно. Отметки сохранятся только до ухода со страницы.</p>
    <section class="vocabulary-panel phrase-filters" aria-label="Выбор сочетаний">
      <label>Поиск <input id="phrase-search" type="search" placeholder="Глагол, чтение или перевод"></label>
      <label>Тема <select id="phrase-topic"><option value="">Все темы</option>${topics.map(t => `<option>${esc(t)}</option>`).join('')}</select></label>
      <label>Изучение <select id="phrase-status"><option value="">Все карточки</option>${Object.entries(labels).map(([k,v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
    </section>
    <p id="phrase-count" role="status" aria-live="polite"></p>
    <div class="phrase-layout"><section id="phrase-study" aria-label="Карточка изучения"></section>
    <details class="phrase-directory"><summary>Список сочетаний</summary><div id="phrase-list"></div></details></div>
    <section class="vocabulary-panel phrase-training" aria-labelledby="phrase-training-title">
      <h2 id="phrase-training-title">Закрепление изученного</h2>
      <p>До 10 заданий по выбранной теме и фильтрам. Ошибки вернут карточку в «Учу».</p>
      <label><input id="phrase-studied" type="checkbox" checked> Только карточки с отметкой «Учу» или «Знаю»</label>
      <label>Задание <select id="phrase-mode"><option value="verb">Дополнить глагол</option><option value="full">Написать сочетание целиком</option></select></label>
      <button id="phrase-start" class="primary" type="button">Начать тренировку</button>
      <p id="phrase-training-help" role="status"></p><div id="phrase-task"></div>
    </section>
    <details class="phrase-sources"><summary>О материале и источники</summary><p>Учебные сочетания составлены для значений из словаря. «Дополнительные глаголы» включают редкие слова за пределами N5. Переводы передают значение сочетания; время действия определяется контекстом.</p>
    ${data.sources.map(s => `<p><a href="${esc(s.url)}" target="_blank" rel="noreferrer">${esc(s.title)} ↗</a></p>`).join('')}</details>`;
  const el = id => root.querySelector(`#${id}`);
  const pool = () => selectPhrases(phrases, progress, filters);
  function save() {
    try { localStorage.setItem(PHRASE_PROGRESS_KEY, JSON.stringify(progress)); }
    catch { el('phrase-storage').hidden = false; }
  }
  function trainingPool() {
    return pool().filter(p => !el('phrase-studied').checked || progress[p.id]);
  }
  function updateTraining() {
    const count = trainingPool().length;
    el('phrase-start').disabled = !count || session !== null;
    el('phrase-training-help').textContent = count ? `Доступно сочетаний: ${count}.`
      : 'Нет карточек для тренировки. Отметьте изученные карточки или измените фильтры.';
  }
  function renderStudy() {
    const target = el('phrase-study');
    if (!current) { target.innerHTML = '<p>По этим фильтрам карточек нет. Измените поиск, тему или статус.</p>'; return; }
    const p = current;
    try { localStorage.setItem('n5-verb-phrase-position', String(p.word_id)); }
    catch { el('phrase-storage').hidden = false; }
    const related = phrases.find(r => r.word_id === p.related_word_id);
    const particle = particleHints[p.prefix.at(-1)] || '';
    target.innerHTML = `<article class="game-card phrase-card">
      <p class="eyebrow">${esc(p.topic)} · ${labels[progress[p.id] || 'new']}</p>
      <h2 class="phrase-japanese" lang="ja">${rubyText(p.prefix,p.prefix_reading)}<strong>${rubyText(p.verb,p.verb_reading)}</strong></h2>
      <p class="kana" lang="ja">${esc(phraseReading(p))}</p>
      <p class="phrase-meaning">${esc(p.meaning)}</p>
      <p><strong lang="ja">${rubyText(p.verb,p.verb_reading)}</strong> — ${esc(p.verb_meaning)}</p>
      ${particle ? `<p class="practice-help">${esc(particle)}</p>` : ''}
      ${p.note ? `<p class="phrase-note">${esc(p.note)}</p>` : ''}
      ${related ? `<div class="phrase-related"><span>Сравните:</span> <button type="button" class="secondary" id="phrase-related"><span lang="ja">${rubyText(phraseText(related),phraseReading(related))}</span> — ${esc(related.meaning)}</button></div>` : ''}
      <div class="practice-actions"><button type="button" class="secondary" id="phrase-learning">Учу · повторять</button>
      <button type="button" class="primary" id="phrase-known">Знаю · дальше</button>
      <button type="button" class="secondary" id="phrase-reset">Снять отметку</button></div>
      <div class="practice-actions"><button type="button" class="secondary" id="phrase-prev">← Предыдущая</button><button type="button" class="secondary" id="phrase-next">Следующая →</button></div>
      <a class="lesson-link" href="/jlpt/n5/vocabulary/complete?q=${encodeURIComponent(p.verb)}">Открыть глагол в словаре →</a>
      </article>`;
    function mark(status) {
      const before = pool();
      const index = before.findIndex(item => item.id === p.id);
      if (status) progress[p.id] = status; else delete progress[p.id];
      save();
      const after = pool();
      current = before.slice(index + 1).find(item => after.includes(item)) || after[0];
      render();
    }
    el('phrase-learning').onclick = () => mark('learning');
    el('phrase-known').onclick = () => mark('known');
    el('phrase-reset').onclick = () => mark(null);
    const move = step => {
      const list = pool();
      current = list[(list.findIndex(item => item.id === p.id) + step + list.length) % list.length];
      renderStudy();
    };
    el('phrase-prev').onclick = () => move(-1);
    el('phrase-next').onclick = () => move(1);
    if (related) el('phrase-related').onclick = () => {
      filters.topic = filters.status = filters.query = '';
      el('phrase-topic').value = el('phrase-status').value = el('phrase-search').value = '';
      current = related; render();
    };
  }
  function render() {
    const list = pool();
    if (!list.includes(current)) current = list[0];
    el('phrase-count').textContent = `Выбрано: ${list.length}. Учу: ${phrases.filter(p => progress[p.id] === 'learning').length}. Знаю: ${phrases.filter(p => progress[p.id] === 'known').length}.`;
    el('phrase-list').innerHTML = list.map(p => `<button type="button" class="phrase-list-item" data-phrase="${esc(p.id)}"><span lang="ja">${rubyText(phraseText(p),phraseReading(p))}</span><span>${esc(p.meaning)}</span><small>${labels[progress[p.id] || 'new']}</small></button>`).join('');
    renderStudy(); updateTraining();
  }
  el('phrase-list').addEventListener('click', e => {
    const button = e.target.closest('[data-phrase]');
    if (!button) return;
    current = phrases.find(p => p.id === button.dataset.phrase); renderStudy();
    el('phrase-study').scrollIntoView({ block: 'nearest' });
  }, { signal });
  for (const [id, field] of [['phrase-search','query'],['phrase-topic','topic'],['phrase-status','status']]) {
    el(id).addEventListener(id === 'phrase-search' ? 'input' : 'change', e => { filters[field] = e.target.value; render(); }, { signal });
  }
  el('phrase-studied').addEventListener('change', updateTraining, { signal });
  function endSession() {
    binding?.destroy(); binding = null;
    session = null; updateTraining();
  }
  function task() {
    binding?.destroy(); binding = null;
    const area = el('phrase-task');
    if (position === session.length) {
      const correct = results.filter(r => r === 'correct').length;
      area.innerHTML = `<h3 tabindex="-1">Занятие завершено: ${correct} из ${session.length} с первой попытки</h3>
        <p>Ошибки и подсказки: ${session.length - correct}. Эти карточки отмечены «Учу».</p>
        <ul>${session.map((p,i) => `<li><span lang="ja">${rubyText(phraseText(p),phraseReading(p))}</span> — ${esc(p.meaning)} · ${results[i] === 'correct' ? 'Верно' : results[i] === 'answer' ? 'С подсказкой' : 'Повторить'}</li>`).join('')}</ul>`;
      endSession(); render(); area.querySelector('h3').focus(); return;
    }
    const p = session[position];
    area.innerHTML = `<section class="game-card"><p>Задание ${position + 1} из ${session.length}</p><h3>${esc(p.meaning)}</h3>
      ${mode === 'verb' ? `<p class="phrase-japanese" lang="ja">${rubyText(p.prefix,p.prefix_reading)}＿＿</p><p class="kana" lang="ja">${esc(p.prefix_reading)}＿＿</p>` : ''}
      <form id="practice-form">${answerFields()}</form><button class="secondary" id="phrase-task-next" type="button" disabled>Дальше →</button>
      <button class="secondary" id="phrase-task-stop" type="button">Закончить тренировку</button></section>`;
    area.querySelector('.practice-label').textContent = mode === 'verb' ? 'Глагол в словарной форме' : 'Сочетание целиком';
    area.querySelector('#practice-input-help').textContent = 'Можно писать каной или кандзи. Ромадзи превращается в хирагану; для を набирайте wo, для へ — he.';
    area.querySelector('#practice-rules').remove();
    binding = bindAnswer(area, () => phraseExercise(p, mode), status => {
      if (status === 'incomplete') return;
      if (!results[position]) {
        results[position] = status;
        if (status !== 'correct') { progress[p.id] = 'learning'; save(); render(); }
      }
      el('phrase-task-next').disabled = false;
    });
    el('phrase-task-next').onclick = () => { position++; task(); };
    el('phrase-task-stop').onclick = () => { endSession(); area.innerHTML = '<p role="status">Тренировка закончена. Отметки карточек сохранены.</p>'; };
    binding.focus();
  }
  el('phrase-start').addEventListener('click', () => {
    session = phraseSession(trainingPool());
    if (!session.length) { session = null; updateTraining(); return; }
    position = 0; results = []; mode = el('phrase-mode').value;
    updateTraining(); task();
  }, { signal });
  signal.addEventListener('abort', () => binding?.destroy(), { once: true });
  render();
}
