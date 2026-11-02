import { getJSON } from './api.js';
import { escapeHTML as esc } from './ui.js';
import { highlightedRule } from './form-highlight.js';
import { loadPreparation, savePreparation, hydrateSkills, practicePlan, noteAnswer, dueSkills, troubleSkills, weakTopics } from './preparation-progress.js';
import { preparationStats, percent } from './preparation-view.js';
import { passageHTML, choiceExplanation, bindReading, readingBookmarks } from './reading-view.js';

export async function mountPreparation(root, signal) {
  root.innerHTML = '<p class="loading">Загружаем задания…</p>';
  const bank = await getJSON('/api/mock-exam', signal);
  if (signal.aborted) return;
  const progress = loadPreparation();
  hydrateSkills(progress, bank);
  const byId = new Map(bank.items.map(q => [q.id,q]));
  let session = progress.session, storageError = false;
  if (!session?.questions?.length || !Number.isInteger(session.index) || session.index < 0
      || session.index > session.questions.length || !Array.isArray(session.results)) session = null;
  if (session) {
    for (const q of session.questions) {
      const item = byId.get(q.id);
      if (item) for (const key of ['skill','hint','evidence','choiceNotes']) q[key] = item[key];
      q.hint = bank.skills.find(s=>s.id===q.skill) || q.hint || {};
      q.wordRefs ||= bank.passages.find(p => p.id === q.passage)?.words || [];
    }
    session.hintLevel ||= session.hinted ? 1 : 0;
    delete session.hinted;
  }
  const requested = new URLSearchParams(location.search).get('mode');
  if (['weak','mistakes'].includes(requested)) {
    session = practicePlan(bank, progress, { mode:requested });
    history.replaceState({}, '', location.pathname);
  }
  let lastTick = Date.now(), ticks = 0;
  function tick() {
    const now = Date.now();
    if (session && session.index < session.questions.length && !session.submitted && !document.hidden) {
      session.elapsed = (session.elapsed || 0) + Math.min(Math.max(now - lastTick,0),5000);
    }
    lastTick = now;
  }
  function save() {
    progress.session = session;
    storageError = !savePreparation(progress);
    const el = root.querySelector('#prep-storage');
    if (el) el.textContent = storageError ? 'Не удалось сохранить прогресс в браузере.' : '';
    return !storageError;
  }
  function shell(body) {
    root.innerHTML = `<h1>Подготовка N5</h1><p id="prep-storage" role="status">${storageError ? 'Не удалось сохранить прогресс в браузере.' : ''}</p>${body}`;
  }
  function scheduleText() {
    return `К повторению: ${dueSkills(progress).length} слов и правил · Ошибки: ${troubleSkills(progress).length} · Слабые темы: ${weakTopics(progress).length}`;
  }
  function home() {
    session = null;
    save();
    shell(`<p id="prep-schedule">${scheduleText()}</p>
      <div class="practice-actions"><button class="primary" data-start="all">Смешанная тренировка</button>
      <button class="secondary" data-start="mistakes" ${troubleSkills(progress).length ? '' : 'disabled'}>Ошибки</button>
      <button class="secondary" data-start="weak" ${weakTopics(progress).length ? '' : 'disabled'}>Слабые темы</button>
      <button class="secondary" data-start="due" ${dueSkills(progress).length ? '' : 'disabled'}>Повторить сегодня</button></div>
      <p class="practice-help">До 10 заданий. Расписание — для каждого слова и правила. Оценка темы — после 5 самостоятельных попыток минимум на 3 разных примерах.</p>
      <details class="prep-topics"><summary>Выбрать тему (${bank.topics.length})</summary><div class="prep-topic-buttons">${bank.topics.map(t => `<button class="secondary" data-topic="${esc(t.id)}">${esc(t.label)} <small>${bank.items.filter(q=>q.topic===t.id).length}</small></button>`).join('')}</div></details>
      ${preparationStats(progress,bank)}${readingBookmarks(progress)}`);
  }
  function render(focus = false) {
    if (!session) return home();
    if (!session.questions.length) {
      shell('<h2 id="prep-heading" tabindex="-1">Нет заданий для этих настроек</h2><button class="primary" data-action="home">К темам</button>');
    } else if (session.index >= session.questions.length) {
      const correct = session.results.filter(r => r.status === 'correct').length;
      shell(`<h2 id="prep-heading" tabindex="-1">Тренировка завершена</h2><p>Без подсказки: ${percent(correct,session.results.length)}</p>
        <p>С подсказкой: ${session.results.filter(r=>r.status==='hinted').length} · Ответ открыт: ${session.results.filter(r=>r.status==='revealed').length} · Не знаю: ${session.results.filter(r=>r.status==='unknown').length}</p>
        <div class="practice-actions"><button class="primary" data-action="home">К темам</button><button class="secondary" data-action="again">Другие задания этой тренировки</button></div>${preparationStats(progress,bank)}${readingBookmarks(progress)}`);
    } else {
      const q = session.questions[session.index], submitted = session.submitted, selected = session.selection;
      const topic = bank.topics.find(t=>t.id===q.topic)?.label || q.topic;
      const hint = q.hint || {};
      const level = session.hintLevel || 0;
      const title = submitted?.status === 'revealed' ? 'Ответ открыт' : submitted?.status === 'unknown' ? 'Не знаю' : submitted?.correct ? 'Верно' : 'Неверно';
      shell(`<p>${esc(topic)} · ${session.index+1} из ${session.questions.length} · ${q.fresh ? 'Новое задание' : 'Повторное задание'}</p>
        <section class="mock-question"><h2 id="prep-heading" tabindex="-1" lang="ja">${esc(q.prompt)}</h2>
        ${q.passageText ? `<p class="mock-passage" lang="ja">${passageHTML(q,!!submitted)}</p>` : ''}
        <fieldset ${submitted ? 'disabled' : ''}><legend class="sr-only">Выберите ответ</legend><div class="mock-choices">${q.choices.map((choice,i)=>`<label class="form-choice"><input type="radio" name="prep-choice" value="${i}" ${selected===i?'checked':''}><span lang="ja">${i+1}. ${esc(choice)}</span></label>`).join('')}</div></fieldset></section>
        <div class="practice-actions prep-actions"><button class="primary" data-action="check" ${submitted || selected===undefined ? 'disabled' : ''}>Проверить · Enter</button>
        <button class="primary" data-action="next" ${submitted?'':'disabled'}>Далее · Shift+Enter</button>
        <button class="secondary" data-action="hint" ${submitted?'disabled':''}>${level===0?'Правило':level===1?'Другой пример':'Показать ответ'}</button>
        <button class="secondary" data-action="unknown" ${submitted?'disabled':''}>Не знаю</button></div>
        <div id="prep-feedback" role="status" aria-live="polite" class="prep-feedback" ${submitted?`data-correct="${submitted.correct}"`:''}>
        ${submitted ? `<strong>${title}${submitted.status==='hinted'?' · С подсказкой':''}</strong>
        <p class="mock-user">Ваш ответ: <span lang="ja">${esc(q.choices[submitted.selected]??'—')}</span></p>
        <p class="mock-correct">Правильный ответ: <span lang="ja">${esc(q.choices[q.correct])}</span></p>
        ${choiceExplanation(q,submitted.selected)}<p>${highlightedRule(q.explanation)}</p>${q.evidence?.length?'<p class="practice-help">В тексте выделено основание ответа. Слова с подчёркиванием открываются в словаре.</p>':''}`
          : level ? `<p>Справка${level===2?' и другой пример':''}. Ответ текущего задания не открыт.</p><p>${highlightedRule(hint.rule || 'Обратите внимание на контекст задания.')}</p>${level===2?`<p>${highlightedRule(hint.example || '')}</p>`:''}` : ''}</div>
        ${q.translation && submitted ? `<details><summary>Перевод</summary><p>${esc(q.translation)}</p></details>` : ''}
        <button class="secondary" data-action="home">К темам</button>`);
    }
    if (focus) root.querySelector('#prep-heading')?.focus({ preventScroll:true });
  }
  function submit(unknown = false, revealed = false) {
    if (!session || session.submitted || session.index >= session.questions.length
        || !unknown && !revealed && session.selection===undefined) return;
    tick();
    const q = session.questions[session.index];
    const selected = unknown || revealed ? null : session.selection;
    const correct = selected === q.correct;
    const status = revealed ? 'revealed' : unknown ? 'unknown' : correct ? (session.hintLevel ? 'hinted' : 'correct') : 'incorrect';
    session.submitted = { selected,correct,status };
    const result = noteAnswer(progress,q,status,session.elapsed || 0,Date.now(),revealed ? 3 : session.hintLevel || 0);
    session.results.push({ ...result,id:q.id });
    save(); render();
    root.querySelector('[data-action="next"]').focus({ preventScroll:true });
  }
  function next() {
    if (!session?.submitted) return;
    session.index++; session.selection=undefined; session.submitted=null; session.hintLevel=0; session.elapsed=0;
    lastTick=Date.now(); save(); render(true);
  }
  function hint() {
    if (!session || session.submitted) return;
    tick();
    if ((session.hintLevel || 0) >= 2) return submit(false,true);
    session.hintLevel=(session.hintLevel || 0)+1;
    save(); render(); root.querySelector('[data-action="hint"]').focus({ preventScroll:true });
  }
  function start(mode,topic='') {
    tick(); session=practicePlan(bank,progress,{mode,topic}); lastTick=Date.now(); save(); render(true);
  }
  bindReading(root,signal,()=>session?.questions || [],progress,save);
  root.addEventListener('change',event=>{
    if (!event.target.matches('[name="prep-choice"]') || session?.submitted) return;
    tick(); session.selection=Number(event.target.value); save(); root.querySelector('[data-action="check"]').disabled=false;
  },{signal});
  root.addEventListener('click',event=>{
    const b=event.target.closest('button'); if (!b) return;
    if (b.dataset.start) return start(b.dataset.start);
    if (b.dataset.topic) return start('all',b.dataset.topic);
    const action=b.dataset.action;
    if (action==='check') submit();
    if (action==='unknown') submit(true);
    if (action==='next') next();
    if (action==='hint') hint();
    if (action==='home') { tick(); home(); }
    if (action==='again') start(session.mode,session.topic);
  },{signal});
  document.addEventListener('keydown',event=>{
    if (!session || session.index>=session.questions.length || event.repeat || event.isComposing
        || event.ctrlKey || event.altKey || event.metaKey || document.querySelector('dialog[open]')) return;
    if (event.key==='Enter' && event.target.closest('button') && !['check','next'].includes(event.target.dataset.action)) return;
    if (event.key==='Enter') { event.preventDefault(); if (event.shiftKey) next(); else submit(); }
    else if (!event.shiftKey && /^[1-4]$/.test(event.key) && !session.submitted) {
      event.preventDefault();
      const radio=root.querySelector(`[name="prep-choice"][value="${Number(event.key)-1}"]`);
      radio.checked=true; radio.dispatchEvent(new Event('change',{bubbles:true})); radio.focus();
    }
  },{signal});
  document.addEventListener('visibilitychange',()=>{tick();save();},{signal});
  window.addEventListener('pagehide',()=>{tick();save();},{signal});
  const interval=setInterval(()=>{
    tick();
    if (++ticks%5===0) {
      save();
      if (!session) {
        for (const [mode,values] of [['due',dueSkills(progress)],['weak',weakTopics(progress)],['mistakes',troubleSkills(progress)]]) root.querySelector(`[data-start=${mode}]`).disabled=!values.length;
        root.querySelector('#prep-schedule').textContent=scheduleText();
      }
    }
  },1000);
  signal.addEventListener('abort',()=>{clearInterval(interval);tick();save();root.querySelectorAll('dialog[open]').forEach(d=>d.close());},{once:true});
  render();
}
