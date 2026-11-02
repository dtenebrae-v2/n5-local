import { getJSON } from './api.js';
import { escapeHTML as esc } from './ui.js';
import { loadPreparation, savePreparation, hydrateSkills, archiveExam } from './preparation-progress.js';
import { preparationStats } from './preparation-view.js';
import { passageHTML, choiceExplanation, bindReading } from './reading-view.js';
import { highlightedRule } from './form-highlight.js';
import { MOCK_KEY, BLUEPRINT, createExam, completeSection, startNextSection, results, validSession } from './mock-engine.js';

const TYPES = { 'reading-kanji': 'Чтение кандзи', orthography: 'Написание', context: 'Слово в контексте', paraphrase: 'Близкое значение', 'grammar-choice': 'Грамматика', 'sentence-order': 'Порядок слов', 'text-grammar': 'Грамматика текста', 'reading-text': 'Чтение' };
export async function mountMockExam(root, signal) {
  root.innerHTML = '<p class="loading">Загружаем пробник…</p>';
  const bank = await getJSON('/api/mock-exam', signal);
  if (signal.aborted) return;
  let exam = null, history = [], storageError = false, preparationError = false;
  const preparation = loadPreparation();
  hydrateSkills(preparation,bank);
  let lastTick = Date.now(), ticks = 0;
  function tick() {
    const now = Date.now();
    if (exam?.phase === 'active' && !document.hidden) {
      const section = exam.sections[exam.section], q = section.questions[exam.index];
      section.elapsed ||= {};
      section.elapsed[q.id] = (section.elapsed[q.id] || 0) + Math.max(0,Math.min(now - lastTick,5000));
    }
    lastTick = now;
  }
  function archive() {
    if (archiveExam(preparation, exam)) {
      preparationError = !savePreparation(preparation);
      if (!preparationError) exam.archived = true;
    }
  }
  try {
    const saved = JSON.parse(localStorage.getItem(MOCK_KEY));
    history = Array.isArray(saved?.history) ? saved.history : [];
    if (validSession(saved?.exam)) {
      exam = saved.exam;
      const byId = new Map(bank.items.map(q=>[q.id,q]));
      for(const section of exam.sections) for(const q of section.questions) {
        const item = byId.get(q.id);
        if(item) for(const key of ['skill','hint','evidence','choiceNotes']) q[key]=item[key];
        q.wordRefs ||= bank.passages.find(p=>p.id===q.passage)?.words || [];
      }
    }
  } catch { /* A damaged save should not prevent a new test. */ }
  let review = false;
  function save() {
    try { localStorage.setItem(MOCK_KEY, JSON.stringify({ exam, history })); storageError = false; }
    catch { storageError = true; }
    const status = root.querySelector('#mock-storage');
    if (status) status.textContent = storageError || preparationError ? 'Не удалось сохранить тест. При закрытии страницы прогресс может потеряться.' : '';
  }
  function shell(body) {
    root.innerHTML = `<h1>Пробный N5 · письменная часть</h1><p id="mock-storage" role="status"></p>${body}`;
    if (storageError || preparationError) root.querySelector('#mock-storage').textContent = 'Не удалось сохранить тест. При закрытии страницы прогресс может потеряться.';
  }
  function intro() {
    shell(`<p>Два блока · 60 минут · 49 вопросов. Без аудирования.</p>
      <p>Лексика — 20 минут. Грамматика и чтение — 40 минут. Ответы и объяснения доступны после завершения обоих блоков. Таймер продолжает идти при закрытии страницы.</p>
      <p>Банк: ${bank.items.length} авторских заданий. Формат учебный; количество вопросов не воспроизводит официальный бланк.</p>
      <button class="primary" data-action="start">Начать тест</button><p><a href="/jlpt/n5/preparation">Тренироваться по темам →</a></p>${preparationStats(preparation,bank)}`);
  }
  function finishBlock(timedOut = false) {
    tick(); completeSection(exam, timedOut);
    if (exam.phase === 'finished') archive();
    save(); render();
  }
  function render(focus = true) {
    if (!exam) return intro();
    if (exam.phase === 'active' && Date.now() >= exam.deadline) return finishBlock(true);
    if (exam.phase === 'between') {
      shell(`<h2 tabindex="-1" id="mock-heading">Первый блок завершён${exam.sections[0].timedOut ? ': время вышло' : ''}</h2><p>Далее — грамматика и чтение, 40 минут. Вернуться к первому блоку уже нельзя. Таймер следующего блока начнётся по кнопке.</p><button class="primary" data-action="continue">Начать второй блок</button>`);
    } else if (exam.phase === 'finished') {
      archive(); save();
      const scores = results(exam);
      const breakdown = Object.entries(TYPES).map(([type,label]) => {
        const questions = exam.sections.flatMap(section => section.questions.filter(q => q.type === type).map(q => ({ q, answer: section.answers[q.id] })));
        return `<li>${esc(label)}: ${questions.filter(({q,answer}) => q.correct === answer).length} из ${questions.length}</li>`;
      }).join('');
      shell(`<h2 tabindex="-1" id="mock-heading">Результаты</h2><p>Вариант ${exam.seed} · ${new Date(exam.created).toLocaleDateString('ru-RU')}</p>
      ${scores.map(s => `<p><strong>${esc(s.label)}: ${s.correct} из ${s.total} (${Math.round(s.correct / s.total * 100)}%)</strong> · Ошибки: ${s.incorrect} · Открыто без ответа: ${s.skipped} · Не открыто: ${s.unopened}</p>`).join('')}
      <details><summary>Результат по типам заданий</summary><ul>${breakdown}</ul></details>
      ${preparationStats(preparation,bank)}
      <p><a class="lesson-link" href="/jlpt/n5/preparation?mode=mistakes">Отработать ошибки →</a></p>
      <p>Это доля правильных ответов, а не официальный балл JLPT.</p>
      <div class="practice-actions"><button class="secondary" data-action="review">${review ? 'Скрыть разбор' : 'Разобрать ответы'}</button><button class="primary" data-action="start">Новый вариант</button></div>
      ${review ? exam.sections.map(s => `<h3>${esc(s.label)}</h3>${s.questions.map((q,i) => {
        const a = s.answers[q.id], correct = a === q.correct;
        return `<article class="mock-review" data-correct="${correct}"><h4>${i + 1}. ${esc(TYPES[q.type])} · ${correct ? 'Верно' : a === undefined ? (s.viewed?.includes(q.id)?'Открыто, без ответа':'Не открыто') : 'Ошибка'}</h4>
        ${q.passageText ? `<p class="mock-passage" lang="ja">${passageHTML(q,true)}</p>` : ''}<p lang="ja">${esc(q.prompt)}</p>
        <p class="mock-user">Ваш ответ: <span lang="ja">${esc(q.choices[a] ?? '—')}</span></p><p class="mock-correct">Правильный ответ: <span lang="ja">${esc(q.choices[q.correct])}</span></p>${choiceExplanation(q,a)}<p>${highlightedRule(q.explanation)}</p>${q.translation?`<details><summary>Перевод текста</summary><p>${esc(q.translation)}</p></details>`:''}</article>`;
      }).join('')}`).join('') : ''}`);
    } else {
      const section = exam.sections[exam.section], q = section.questions[exam.index];
      section.viewed ||= [];
      if(!section.viewed.includes(q.id)) section.viewed.push(q.id);
      save();
      shell(`<div class="mock-toolbar"><strong>${esc(section.label)}</strong><span id="mock-time" role="timer" aria-label="Оставшееся время"></span></div>
      <p>Вопрос ${exam.index + 1} из ${section.questions.length} · Отвечено: ${Object.keys(section.answers).length}</p>
      <details class="mock-map"><summary>Карта вопросов</summary><nav class="mock-numbers" aria-label="Вопросы блока">${section.questions.map((v,i) => `<button class="secondary ${i === exam.index ? 'selected' : ''}" data-index="${i}" ${i === exam.index ? 'aria-current="step"' : ''} aria-label="Вопрос ${i+1}${section.answers[v.id] !== undefined ? ', отвечен' : ''}${section.marked.includes(v.id) ? ', отмечен' : ''}">${i+1}${section.marked.includes(v.id) ? ' ★' : section.answers[v.id] !== undefined ? ' ✓' : ''}</button>`).join('')}</nav></details>
      <section class="mock-question"><h2 id="mock-heading" tabindex="-1">${esc(TYPES[q.type])}</h2>
      ${q.passageText ? `<p class="mock-passage" lang="ja">${esc(q.passageText)}</p>` : ''}
      <fieldset><legend lang="ja">${esc(q.prompt)}</legend><div class="mock-choices">${q.choices.map((choice,i) => `<label class="form-choice"><input type="radio" name="mock-choice" value="${i}" ${section.answers[q.id] === i ? 'checked' : ''}><span lang="ja">${i+1}. ${esc(choice)}</span></label>`).join('')}</div></fieldset></section>
      <div class="practice-actions"><button class="secondary" data-action="prev" ${exam.index === 0 ? 'disabled' : ''}>← Назад</button><button class="primary" data-action="next" ${exam.index === section.questions.length-1 ? 'disabled' : ''}>Далее →</button>
      <button class="secondary" data-action="mark" aria-pressed="${section.marked.includes(q.id)}">${section.marked.includes(q.id) ? '★ Отмечен' : 'Вернуться позже'}</button><button class="secondary" data-action="end-block">Завершить блок</button></div>
      <p class="practice-help">1–4 — выбрать ответ · ← / → — перейти к вопросу</p>`);
      updateTimer();
    }
    if (focus) root.querySelector('#mock-heading')?.focus({ preventScroll: true });
  }
  function updateTimer() {
    if (!exam || exam.phase !== 'active') return;
    const seconds = Math.max(0, Math.ceil((exam.deadline - Date.now()) / 1000));
    const timer = root.querySelector('#mock-time');
    if (timer) { timer.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2,'0')}`; timer.classList.toggle('mock-urgent', seconds <= 300); }
    if (!seconds) finishBlock(true);
  }
  function move(index) {
    tick();
    const s = exam.sections[exam.section];
    exam.index = Math.max(0, Math.min(s.questions.length - 1, index)); save(); render();
  }
  bindReading(root,signal,()=>exam?.phase==='finished'?exam.sections.flatMap(s=>s.questions):[],preparation,()=>{preparationError=!savePreparation(preparation);save();return !preparationError;});
  root.addEventListener('change', event => {
    if (!event.target.matches('[name="mock-choice"]') || exam?.phase !== 'active') return;
    if (Date.now() >= exam.deadline) return finishBlock(true);
    tick();
    const section = exam.sections[exam.section];
    section.answers[section.questions[exam.index].id] = Number(event.target.value);
    save(); render(false); root.querySelector(`[name="mock-choice"][value="${event.target.value}"]`)?.focus();
  }, { signal });
  root.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    if (exam?.phase === 'active' && Date.now() >= exam.deadline) return finishBlock(true);
    if (button.hasAttribute('data-index') && exam?.phase === 'active') return move(Number(button.dataset.index));
    const action = button.dataset.action;
    if (action === 'start') {
      tick();
      if (exam) history = [...exam.sections.flatMap(s => s.questions.map(q => q.id)), ...history].slice(0,200);
      exam = createExam(bank, crypto.getRandomValues(new Uint32Array(1))[0], history); review = false; save(); render();
    } else if (action === 'continue') { lastTick=Date.now(); startNextSection(exam); save(); render(); }
    else if (action === 'review') { review = !review; render(false); }
    else if (action === 'prev') move(exam.index-1);
    else if (action === 'next') move(exam.index+1);
    else if (action === 'mark') {
      const s = exam.sections[exam.section], id = s.questions[exam.index].id;
      s.marked = s.marked.includes(id) ? s.marked.filter(x => x !== id) : [...s.marked,id]; save(); render(false); root.querySelector('[data-action="mark"]').focus();
    } else if (action === 'end-block') {
      const s = exam.sections[exam.section], left = s.questions.length - Object.keys(s.answers).length;
      const dialog = document.createElement('dialog'); dialog.className = 'practice-dialog';
      dialog.innerHTML = `<h2>Завершить блок?</h2><p>${left ? `Без ответа: ${left}. ` : ''}Вернуться к вопросам этого блока уже нельзя.</p><div class="practice-actions"><button class="primary" data-confirm>Завершить</button><button class="secondary" data-cancel>Продолжить отвечать</button></div>`;
      root.append(dialog); dialog.showModal();
      dialog.querySelector('[data-confirm]').onclick = () => { dialog.close(); finishBlock(); };
      dialog.querySelector('[data-cancel]').onclick = () => dialog.close();
      dialog.addEventListener('close', () => { dialog.remove(); root.querySelector('[data-action="end-block"]')?.focus(); }, { once: true });
    }
  }, { signal });
  document.addEventListener('keydown', event => {
    if (exam?.phase !== 'active' || event.repeat || event.isComposing || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || document.querySelector('dialog[open]')) return;
    if (Date.now() >= exam.deadline) { updateTimer(); return; }
    if (/^[1-4]$/.test(event.key)) { event.preventDefault(); const radio = root.querySelector(`[name="mock-choice"][value="${Number(event.key)-1}"]`); radio.checked = true; radio.dispatchEvent(new Event('change',{ bubbles: true })); }
    else if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); move(exam.index + (event.key === 'ArrowRight' ? 1 : -1)); }
  }, { signal });
  document.addEventListener('visibilitychange', () => { tick(); if(exam)save(); }, {signal});
  window.addEventListener('pagehide', () => { tick(); if(exam)save(); }, {signal});
  const interval = setInterval(() => { tick(); updateTimer(); if(exam && ++ticks % 5 === 0) save(); }, 1000);
  signal.addEventListener('abort', () => { clearInterval(interval); tick(); if(exam)save(); root.querySelectorAll('dialog[open]').forEach(d => d.close()); }, { once: true });
  render(false);
}
