import { getJSON } from './api.js';
import { escapeHTML as esc } from './ui.js';
import { answerFields, bindAnswer } from './practice-answer.js';
import { highlightedForm, highlightedRule } from './form-highlight.js';
import { mountShortcuts } from './training-shortcuts.js';
import { counterPool, counterExercise, counterSession, restoreCounterSession } from './counter-exercise.js';

const STORAGE = 'n5.counters.v1';
function reference(counter, number) {
  return `<h3>${esc(counter.symbol)} · ${esc(counter.label)}</h3><p>${highlightedRule(counter.rule)}</p>
    <table class="counter-table"><thead><tr><th scope="col">Запись</th><th scope="col">Чтение</th></tr></thead><tbody>
    ${counter.forms.map(form => `<tr ${form.number === number ? 'class="current-rule" aria-current="true"' : ''}>
      <th scope="row" lang="ja">${esc(form.written)}</th><td lang="ja">${form.readings.map(reading => highlightedForm(reading, form.base)).join('<br>')}</td></tr>`).join('')}</tbody></table>
    <details class="counter-sources"><summary>Источники</summary>${counter.sources.map(source => `<p><a href="${esc(source.url)}" target="_blank" rel="noreferrer">${esc(source.title)} ↗</a></p>`).join('')}</details>`;
}

export async function mountCounters(root, signal) {
  const data = await getJSON('/api/counters', signal);
  if (signal.aborted) return;
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(STORAGE)) || {}; } catch { /* Use defaults if storage is unavailable. */ }
  const ids = data.counters.map(counter => counter.id);
  const selected = Array.isArray(saved.selected) ? saved.selected.filter(id => ids.includes(id)) : ids;
  const state = { selected: selected.length ? selected : ids, limit: saved.limit === 20 ? 20 : 10, shortcuts: saved.shortcuts };
  const pool = counterPool(data.counters, ids);
  const byKey = new Map(pool.map(item => [item.key, item]));
  let session = restoreCounterSession(saved.session, pool);
  let binding, shortcuts, dialog;
  root.innerHTML = `<h1>Счётные суффиксы</h1>
    <div class="library-filters" role="group" aria-label="Режим суффиксов"><button class="chip selected" data-counter-mode="practice" aria-pressed="true">Тренировка</button><button class="chip" data-counter-mode="reference" aria-pressed="false">Справка · 17</button></div>
    <section id="counter-practice"><details id="game-options"><summary>Настройки</summary>
      <div class="counter-choices" role="group" aria-label="Суффиксы для тренировки">${data.counters.map(counter => `<button type="button" class="chip" data-counter="${counter.id}"><b lang="ja">${esc(counter.symbol)}</b> ${esc(counter.label)}</button>`).join('')}</div>
      <div class="library-filters" role="group" aria-label="Количество заданий">${[10,20].map(n => `<button class="chip" data-counter-limit="${n}">${n} заданий</button>`).join('')}<button class="secondary" id="counter-all">Выбрать все</button></div>
      <button class="primary" id="counter-start">Начать заново</button></details>
      <p id="counter-storage" role="status"></p><div id="counter-task"></div></section>
    <section id="counter-reference" hidden><div class="counter-choices" role="group" aria-label="Справка по суффиксу">${data.counters.map(counter => `<button class="chip" data-counter-reference="${counter.id}">${esc(counter.symbol)} · ${esc(counter.label)}</button>`).join('')}</div><div id="counter-table"></div></section>`;
  function save() {
    try { localStorage.setItem(STORAGE, JSON.stringify({ ...state, session })); }
    catch { root.querySelector('#counter-storage').textContent = 'Не удалось сохранить занятие в этом браузере.'; }
  }
  function choices() {
    root.querySelectorAll('[data-counter]').forEach(button => {
      const active = state.selected.includes(button.dataset.counter);
      button.classList.toggle('selected', active); button.setAttribute('aria-pressed', String(active));
    });
    root.querySelectorAll('[data-counter-limit]').forEach(button => {
      const active = Number(button.dataset.counterLimit) === state.limit;
      button.classList.toggle('selected', active); button.setAttribute('aria-pressed', String(active));
    });
  }
  function item() { return byKey.get(session?.keys[session.position]); }
  function answer() {
    const key = item().key;
    return session.answers[key] ||= { value: '', first: null, status: null, assisted: false };
  }
  function rules() {
    if (!item() || dialog?.open) return;
    if (!answer().first) answer().assisted = true;
    save();
    dialog = document.createElement('dialog');
    dialog.className = 'practice-dialog counter-dialog';
    dialog.setAttribute('aria-labelledby', 'counter-rules-title');
    dialog.innerHTML = `<div class="practice-header"><h2 id="counter-rules-title">Справка</h2><button class="practice-close" aria-label="Закрыть справку">×</button></div>${reference(item().counter, item().form.number)}`;
    dialog.querySelector('button').addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => { dialog.remove(); if (!signal.aborted) binding?.focus(); }, { once: true });
    document.body.append(dialog); dialog.showModal();
  }
  function next() {
    if (!item()) return;
    const record = answer();
    record.first ||= 'skip';
    session.position++; save(); renderTask(true);
  }
  function summary() {
    const correct = session.keys.filter(key => session.answers[key]?.first === 'correct' && !session.answers[key]?.assisted).length;
    const labels = { correct: 'Верно', incorrect: 'Ошибка', answer: 'Ответ открыт', unknown: 'Не знаю', skip: 'Пропущено' };
    return `<h2 tabindex="-1" id="counter-summary">Результат: ${correct} из ${session.keys.length} без подсказок с первой попытки</h2>
      <button class="primary" id="counter-again">Ещё раз</button><div class="counter-results">${session.keys.map(key => {
        const question = byKey.get(key), record = session.answers[key], status = record?.first || 'skip';
        return `<article class="counter-result" data-result="${status}"><h3>${question.form.number} · ${esc(question.counter.label)}</h3>
          <p class="counter-result-status">${record?.assisted ? 'С подсказкой · ' : ''}${labels[status]}</p><p class="counter-user">Первая попытка: <span lang="ja">${esc(record?.firstValue || '—')}</span></p>
          <p class="counter-correct" lang="ja">${esc(counterExercise(question).displayAnswers[0])}</p></article>`;
      }).join('')}</div>`;
  }
  function renderTask(focus = false) {
    binding?.destroy(); binding = null;
    const task = root.querySelector('#counter-task');
    if (!item()) {
      task.innerHTML = summary();
      task.querySelector('#counter-again').addEventListener('click', start, { signal });
      if (focus) task.querySelector('h2').focus();
      return;
    }
    const current = item();
    task.innerHTML = `<p class="counter-progress">Задание ${session.position + 1} из ${session.keys.length}</p>
      <section class="game-card counter-card"><h2 class="game-target">${current.form.number} · ${esc(current.counter.label)}</h2>
      <p class="counter-instruction">Запишите число со счётным суффиксом хираганой.</p>
      <form id="practice-form">${answerFields()}</form></section>`;
    task.querySelector('label').textContent = 'Число и суффикс целиком';
    task.querySelector('#practice-input-help').textContent = 'Ромадзи превращается в хирагану при вводе.';
    const actions = task.querySelector('.practice-actions');
    actions.insertAdjacentHTML('beforeend', '<button class="secondary game-advance" type="button" id="counter-next">Дальше</button><button class="secondary" type="button" id="counter-unknown">Не знаю</button>');
    binding = bindAnswer(task, () => counterExercise(item()), status => {
      if (status === 'incomplete') return;
      const record = answer(); record.value = task.querySelector('input').value; record.status = status;
      if (!record.first) { record.first = status; record.firstValue = record.value; }
      save();
    });
    const record = answer();
    task.querySelector('input').value = record.value;
    if (record.status) binding.render(record.status, record.value);
    task.querySelector('input').addEventListener('input', () => { const record = answer(); record.value = task.querySelector('input').value; record.status = null; save(); }, { signal });
    task.querySelector('#practice-rules').addEventListener('click', rules, { signal });
    task.querySelector('#counter-unknown').addEventListener('click', () => binding.reveal('unknown'), { signal });
    task.querySelector('#counter-next').addEventListener('click', next, { signal });
    if (focus) binding.focus();
  }
  function start() {
    session = counterSession(counterPool(data.counters, state.selected), state.limit);
    root.querySelector('#game-options').open = false;
    save(); renderTask(true);
  }
  function showReference(id) {
    const counter = data.counters.find(counter => counter.id === id);
    root.querySelector('#counter-table').innerHTML = reference(counter);
    root.querySelectorAll('[data-counter-reference]').forEach(button => {
      const active = button.dataset.counterReference === id;
      button.classList.toggle('selected', active); button.setAttribute('aria-pressed', String(active));
    });
  }
  root.addEventListener('click', event => {
    const button = event.target.closest('button'); if (!button) return;
    if (button.dataset.counter) {
      const id = button.dataset.counter;
      if (state.selected.includes(id)) { if (state.selected.length > 1) state.selected = state.selected.filter(value => value !== id); }
      else state.selected.push(id);
      choices(); save();
    }
    if (button.dataset.counterLimit) { state.limit = Number(button.dataset.counterLimit); choices(); save(); }
    if (button.id === 'counter-all') { state.selected = [...ids]; choices(); save(); }
    if (button.dataset.counterReference) showReference(button.dataset.counterReference);
    if (button.dataset.counterMode) {
      const mode = button.dataset.counterMode;
      root.querySelector('#counter-practice').hidden = mode !== 'practice';
      root.querySelector('#counter-reference').hidden = mode !== 'reference';
      root.querySelectorAll('[data-counter-mode]').forEach(b => { b.classList.toggle('selected', b === button); b.setAttribute('aria-pressed', String(b === button)); });
    }
  }, { signal });
  root.querySelector('#counter-start').addEventListener('click', start, { signal });
  shortcuts = mountShortcuts(root, state, save, signal, () => {});
  document.addEventListener('keydown', event => {
    if (signal.aborted || event.isComposing || binding?.composing || root.querySelector('#counter-practice').hidden) return;
    if (shortcuts.handleCapture(event)) return;
    if (document.querySelector('dialog[open]') || !item()) return;
    for (const [action, callback] of [['next', next], ['rules', rules], ['unknown', () => binding.reveal('unknown')]]) {
      if (shortcuts.matches(action, event)) { event.preventDefault(); callback(); break; }
    }
  }, { signal });
  signal.addEventListener('abort', () => { binding?.destroy(); dialog?.close(); }, { once: true });
  choices(); showReference(ids[0]);
  if (!session) start(); else renderTask();
}
